package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/db/sqlc"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/handlers"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// uniqueViolationErr produces a *pgconn.PgError with SQLSTATE 23505 so the
// retry logic in the handler treats it as a PK collision.
func uniqueViolationErr() error {
	return &pgconn.PgError{Code: "23505"}
}

// fakePartiesStorer is an in-memory PartiesStorer for unit tests.
type fakePartiesStorer struct {
	// createErr is returned by CreateParty. If it is a slice, entries are
	// consumed one at a time so callers can simulate N failures then success.
	createErrs []error
	createIdx  int
	getErr     error
	parties    map[string]sqlc.Party
}

func newFakePartiesStorer() *fakePartiesStorer {
	return &fakePartiesStorer{parties: make(map[string]sqlc.Party)}
}

func (f *fakePartiesStorer) CreateParty(_ context.Context, arg sqlc.CreatePartyParams) (sqlc.Party, error) {
	var err error
	if f.createIdx < len(f.createErrs) {
		err = f.createErrs[f.createIdx]
		f.createIdx++
	}
	if err != nil {
		return sqlc.Party{}, err
	}
	now := pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	p := sqlc.Party{
		ID:         arg.ID,
		HostUserID: arg.HostUserID,
		Name:       arg.Name,
		Settings:   arg.Settings,
		IsActive:   true,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	f.parties[arg.ID] = p
	return p, nil
}

func (f *fakePartiesStorer) GetParty(_ context.Context, id string) (sqlc.Party, error) {
	if f.getErr != nil {
		return sqlc.Party{}, f.getErr
	}
	p, ok := f.parties[id]
	if !ok {
		return sqlc.Party{}, pgx.ErrNoRows
	}
	return p, nil
}

// buildPartiesRouter constructs a Gin engine with the parties handler wired under /api.
func buildPartiesRouter(t *testing.T, store handlers.PartiesStorer, userID string) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	api := r.Group("/api")
	api.Use(func(c *gin.Context) {
		c.Set("auth.user_id", userID)
		c.Next()
	})
	handlers.RegisterPartiesWithStorer(api, store)
	return r
}

func getJSON(t *testing.T, r *gin.Engine, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func postJSONParties(t *testing.T, r *gin.Engine, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	payload, err := json.Marshal(body)
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// TestCreateParty_HappyPath verifies 201 response with a 6-char id and correct name.
func TestCreateParty_HappyPath(t *testing.T) {
	store := newFakePartiesStorer()
	r := buildPartiesRouter(t, store, "user1")

	w := postJSONParties(t, r, "/api/parties", map[string]string{"name": "Saturday Night"})

	assert.Equal(t, http.StatusCreated, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	id, ok := resp["id"].(string)
	assert.True(t, ok, "id should be a string")
	assert.Len(t, id, 6, "id should be 6 characters")
	assert.Equal(t, resp["id"], resp["shortId"], "id and shortId should match")
	assert.Equal(t, "Saturday Night", resp["name"])
	assert.Equal(t, "user1", resp["hostUserId"])
	assert.Equal(t, true, resp["isActive"])
	assert.NotEmpty(t, resp["createdAt"])
	assert.NotEmpty(t, resp["updatedAt"])
}

// TestCreateParty_EmptyName verifies 400 missing_field when name is empty.
func TestCreateParty_EmptyName(t *testing.T) {
	store := newFakePartiesStorer()
	r := buildPartiesRouter(t, store, "user1")

	w := postJSONParties(t, r, "/api/parties", map[string]string{"name": ""})

	assert.Equal(t, http.StatusBadRequest, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "missing_field", resp["code"])
}

// TestCreateParty_WhitespaceOnlyName verifies 400 when name is whitespace-only.
func TestCreateParty_WhitespaceOnlyName(t *testing.T) {
	store := newFakePartiesStorer()
	r := buildPartiesRouter(t, store, "user1")

	w := postJSONParties(t, r, "/api/parties", map[string]string{"name": "   "})

	assert.Equal(t, http.StatusBadRequest, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "missing_field", resp["code"])
}

// TestCreateParty_NameTooLong verifies 400 invalid_field when name exceeds 200 chars.
func TestCreateParty_NameTooLong(t *testing.T) {
	store := newFakePartiesStorer()
	r := buildPartiesRouter(t, store, "user1")

	longName := bytes.Repeat([]byte("a"), 201) // 201 chars; limit is 200

	w := postJSONParties(t, r, "/api/parties", map[string]string{"name": string(longName)})

	assert.Equal(t, http.StatusBadRequest, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "invalid_field", resp["code"])
}

// TestCreateParty_BodyTooLarge verifies 400 when the request body exceeds the cap.
func TestCreateParty_BodyTooLarge(t *testing.T) {
	store := newFakePartiesStorer()
	r := buildPartiesRouter(t, store, "user1")

	// 70 KiB of payload, well over the 64 KiB cap. Crafted as valid JSON so the
	// failure point is the body-size limit, not a parse error from garbage.
	bigSettings := make(map[string]string, 700)
	for i := 0; i < 700; i++ {
		bigSettings[string(rune('a'+i%26))+string(rune('a'+i/26))+"_pad"] = string(bytes.Repeat([]byte("x"), 100))
	}
	payload, err := json.Marshal(map[string]any{
		"name":     "Big Body Party",
		"settings": bigSettings,
	})
	require.NoError(t, err)
	require.Greater(t, len(payload), 64*1024, "test payload must exceed the body cap")

	req := httptest.NewRequest(http.MethodPost, "/api/parties", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	// MaxBytesReader surfaces a generic parse error to ShouldBindJSON, so the
	// handler returns the standard missing_field path. The important assertion
	// is that the request did NOT reach the DB layer.
	assert.Equal(t, "missing_field", resp["code"])
	// No party was created.
	assert.Empty(t, store.parties)
}

// TestCreateParty_MissingBody verifies 400 on a completely missing body.
func TestCreateParty_MissingBody(t *testing.T) {
	store := newFakePartiesStorer()
	r := buildPartiesRouter(t, store, "user1")

	req := httptest.NewRequest(http.MethodPost, "/api/parties", nil)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "missing_field", resp["code"])
}

// TestCreateParty_WithSettings verifies the settings object round-trips in the response.
func TestCreateParty_WithSettings(t *testing.T) {
	store := newFakePartiesStorer()
	r := buildPartiesRouter(t, store, "user1")

	w := postJSONParties(t, r, "/api/parties", map[string]any{
		"name":     "Theme Party",
		"settings": map[string]any{"genre": "jazz", "maxTracks": float64(50)},
	})

	assert.Equal(t, http.StatusCreated, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	settings, ok := resp["settings"].(map[string]any)
	assert.True(t, ok, "settings should be an object")
	assert.Equal(t, "jazz", settings["genre"])
	assert.Equal(t, float64(50), settings["maxTracks"])
}

// TestCreateParty_DBError verifies 500 internal_error on a non-collision DB failure.
func TestCreateParty_DBError(t *testing.T) {
	store := newFakePartiesStorer()
	store.createErrs = []error{errors.New("connection refused")}
	r := buildPartiesRouter(t, store, "user1")

	w := postJSONParties(t, r, "/api/parties", map[string]string{"name": "Crash Party"})

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "internal_error", resp["code"])
}

// TestCreateParty_CollisionRetry verifies that one 23505 collision causes a
// retry and the response uses the second generated id.
func TestCreateParty_CollisionRetry(t *testing.T) {
	store := newFakePartiesStorer()
	// First call collides; second succeeds.
	store.createErrs = []error{uniqueViolationErr()}
	r := buildPartiesRouter(t, store, "user1")

	w := postJSONParties(t, r, "/api/parties", map[string]string{"name": "Retry Party"})

	assert.Equal(t, http.StatusCreated, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	id, ok := resp["id"].(string)
	assert.True(t, ok)
	assert.Len(t, id, 6)
	assert.Equal(t, "Retry Party", resp["name"])
	// Confirm two attempts were made (createIdx advanced past the one error).
	assert.Equal(t, 1, store.createIdx, "should have consumed the one collision error")
}

// TestCreateParty_ExhaustedRetries verifies 500 when all 5 retries collide.
func TestCreateParty_ExhaustedRetries(t *testing.T) {
	store := newFakePartiesStorer()
	store.createErrs = []error{
		uniqueViolationErr(),
		uniqueViolationErr(),
		uniqueViolationErr(),
		uniqueViolationErr(),
		uniqueViolationErr(),
	}
	r := buildPartiesRouter(t, store, "user1")

	w := postJSONParties(t, r, "/api/parties", map[string]string{"name": "Doomed Party"})

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "internal_error", resp["code"])
	// No internal details should leak.
	assert.NotContains(t, w.Body.String(), "retry")
	assert.NotContains(t, w.Body.String(), "exhausted")
}

// TestGetParty_HappyPath verifies 200 response for an existing party.
func TestGetParty_HappyPath(t *testing.T) {
	store := newFakePartiesStorer()
	// Pre-seed a party.
	now := pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	store.parties["abc123"] = sqlc.Party{
		ID:         "abc123",
		HostUserID: "user42",
		Name:       "Pre-seeded Party",
		Settings:   []byte(`{"key":"val"}`),
		IsActive:   true,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	r := buildPartiesRouter(t, store, "user42")

	w := getJSON(t, r, "/api/parties/abc123")

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "abc123", resp["id"])
	assert.Equal(t, "abc123", resp["shortId"])
	assert.Equal(t, "Pre-seeded Party", resp["name"])
	assert.Equal(t, "user42", resp["hostUserId"])
	settings, ok := resp["settings"].(map[string]any)
	assert.True(t, ok)
	assert.Equal(t, "val", settings["key"])
}

// TestGetParty_NotFound verifies 404 party_not_found when the id does not exist.
func TestGetParty_NotFound(t *testing.T) {
	store := newFakePartiesStorer()
	r := buildPartiesRouter(t, store, "user1")

	w := getJSON(t, r, "/api/parties/xxxxxx")

	assert.Equal(t, http.StatusNotFound, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "party_not_found", resp["code"])
}

// TestGetParty_DBError verifies 500 internal_error on a non-not-found DB failure.
func TestGetParty_DBError(t *testing.T) {
	store := newFakePartiesStorer()
	store.getErr = errors.New("db timeout")
	r := buildPartiesRouter(t, store, "user1")

	w := getJSON(t, r, "/api/parties/abc123")

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "internal_error", resp["code"])
}
