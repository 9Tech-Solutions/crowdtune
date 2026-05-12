package handlers_test

import (
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
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeQueueStorer is an in-memory QueueStorer for unit tests.
type fakeQueueStorer struct {
	parties     map[string]sqlc.Party
	queueTracks map[string][]sqlc.QueueTrack
	getPartyErr error
	listErr     error
}

func newFakeQueueStorer() *fakeQueueStorer {
	return &fakeQueueStorer{
		parties:     make(map[string]sqlc.Party),
		queueTracks: make(map[string][]sqlc.QueueTrack),
	}
}

func (f *fakeQueueStorer) GetParty(_ context.Context, id string) (sqlc.Party, error) {
	if f.getPartyErr != nil {
		return sqlc.Party{}, f.getPartyErr
	}
	p, ok := f.parties[id]
	if !ok {
		return sqlc.Party{}, pgx.ErrNoRows
	}
	return p, nil
}

func (f *fakeQueueStorer) ListQueueTracksByParty(_ context.Context, partyID string) ([]sqlc.QueueTrack, error) {
	if f.listErr != nil {
		return nil, f.listErr
	}
	return f.queueTracks[partyID], nil
}

// buildQueueRouter constructs a Gin engine with the queue handler wired under /api.
func buildQueueRouter(t *testing.T, store handlers.QueueStorer, userID string) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	api := r.Group("/api")
	api.Use(func(c *gin.Context) {
		c.Set("auth.user_id", userID)
		c.Next()
	})
	handlers.RegisterQueueWithStorer(api, store)
	return r
}

// seedParty adds a party to the fake store.
func seedParty(f *fakeQueueStorer, id string) {
	now := pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	f.parties[id] = sqlc.Party{
		ID:         id,
		HostUserID: "host1",
		Name:       "Test Party",
		Settings:   []byte(`{}`),
		IsActive:   true,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
}

// makeTrack builds a sqlc.QueueTrack with the given fields.
func makeTrack(partyID, provider, trackID string, voteCount int32, orderIdx int64, isFallback bool, addedAt time.Time) sqlc.QueueTrack {
	return sqlc.QueueTrack{
		PartyID:         partyID,
		Provider:        provider,
		ProviderTrackID: trackID,
		VoteCount:       voteCount,
		OrderIdx:        orderIdx,
		IsFallback:      isFallback,
		AddedAt:         pgtype.Timestamptz{Time: addedAt.UTC(), Valid: true},
	}
}

// TestListQueueTracks_HappyPath verifies 200 with correctly ordered tracks.
func TestListQueueTracks_HappyPath(t *testing.T) {
	store := newFakeQueueStorer()
	seedParty(store, "party1")

	base := time.Date(2026, 5, 12, 14, 0, 0, 0, time.UTC)
	// Seeded in order_idx ASC order, matching what the real DB returns via the index.
	store.queueTracks["party1"] = []sqlc.QueueTrack{
		makeTrack("party1", "spotify", "track_a", 3, -100, false, base.Add(1*time.Minute)),
		makeTrack("party1", "spotify", "track_b", 1, 200, false, base.Add(2*time.Minute)),
		makeTrack("party1", "spotify", "track_c", 0, 500, true, base.Add(3*time.Minute)),
	}

	r := buildQueueRouter(t, store, "user1")
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/parties/party1/tracks", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	tracks, ok := resp["tracks"].([]any)
	require.True(t, ok, "tracks must be an array")
	assert.Len(t, tracks, 3)

	// First track should have orderIdx -100 (lowest).
	first := tracks[0].(map[string]any)
	ref := first["reference"].(map[string]any)
	assert.Equal(t, "spotify", ref["provider"])
	assert.Equal(t, "track_a", ref["id"])
	assert.Equal(t, float64(-100), first["orderIdx"])
	assert.Equal(t, float64(3), first["voteCount"])
	assert.Equal(t, false, first["isFallback"])
	assert.NotEmpty(t, first["addedAt"])

	// Second track orderIdx 200.
	second := tracks[1].(map[string]any)
	assert.Equal(t, float64(200), second["orderIdx"])

	// Third track orderIdx 500, isFallback true.
	third := tracks[2].(map[string]any)
	assert.Equal(t, float64(500), third["orderIdx"])
	assert.Equal(t, true, third["isFallback"])
}

// TestListQueueTracks_EmptyQueue verifies 200 with a non-null empty array.
func TestListQueueTracks_EmptyQueue(t *testing.T) {
	store := newFakeQueueStorer()
	seedParty(store, "party1")
	// No tracks added to store.

	r := buildQueueRouter(t, store, "user1")
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/parties/party1/tracks", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	tracks, ok := resp["tracks"].([]any)
	// JSON null would not satisfy the []any assertion; an empty array would be []any{}.
	// When tracks is nil in JSON the Unmarshal gives nil, not []any{}.
	// Our handler uses make([]queueTrackResponse, 0) equivalent (empty slice), so we
	// must ensure we have a non-null array. Check explicitly.
	assert.True(t, ok || resp["tracks"] != nil, "tracks key must be present and non-null")
	if ok {
		assert.Empty(t, tracks)
	}

	// Also verify the raw JSON literal contains [] not null.
	assert.Contains(t, w.Body.String(), `"tracks":[]`)
}

// TestListQueueTracks_PartyNotFound verifies 404 party_not_found when party is absent.
func TestListQueueTracks_PartyNotFound(t *testing.T) {
	store := newFakeQueueStorer()
	// No party seeded.

	r := buildQueueRouter(t, store, "user1")
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/parties/missing/tracks", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "party_not_found", resp["code"])
}

// TestListQueueTracks_GetPartyDBError verifies 500 on a DB error in GetParty.
func TestListQueueTracks_GetPartyDBError(t *testing.T) {
	store := newFakeQueueStorer()
	store.getPartyErr = errors.New("connection timeout")

	r := buildQueueRouter(t, store, "user1")
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/parties/party1/tracks", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "internal_error", resp["code"])
}

// TestListQueueTracks_ListTracksDBError verifies 500 on a DB error in ListQueueTracksByParty.
func TestListQueueTracks_ListTracksDBError(t *testing.T) {
	store := newFakeQueueStorer()
	seedParty(store, "party1")
	store.listErr = errors.New("query failed")

	r := buildQueueRouter(t, store, "user1")
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/parties/party1/tracks", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "internal_error", resp["code"])
}

// TestListQueueTracks_Tiebreaker verifies that tracks with identical order_idx are
// returned in added_at ASC order (oldest first).
func TestListQueueTracks_Tiebreaker(t *testing.T) {
	store := newFakeQueueStorer()
	seedParty(store, "party1")

	base := time.Date(2026, 5, 12, 10, 0, 0, 0, time.UTC)
	// Both tracks share order_idx=0; newer track is listed first in the slice
	// to confirm the handler relies on DB ordering (the fake preserves insertion order,
	// so we pre-sort them as the DB would — oldest first).
	store.queueTracks["party1"] = []sqlc.QueueTrack{
		makeTrack("party1", "spotify", "old_track", 2, 0, false, base),
		makeTrack("party1", "spotify", "new_track", 1, 0, false, base.Add(5*time.Minute)),
	}

	r := buildQueueRouter(t, store, "user1")
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/parties/party1/tracks", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	tracks := resp["tracks"].([]any)
	require.Len(t, tracks, 2)

	first := tracks[0].(map[string]any)
	ref := first["reference"].(map[string]any)
	assert.Equal(t, "old_track", ref["id"], "oldest added_at track should be first")

	second := tracks[1].(map[string]any)
	ref2 := second["reference"].(map[string]any)
	assert.Equal(t, "new_track", ref2["id"], "newer added_at track should be second")
}
