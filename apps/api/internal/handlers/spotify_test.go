package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/db/sqlc"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/handlers"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/spotify"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/tokencrypto"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeStorer is an in-memory SpotifyStorer for unit tests.
type fakeStorer struct {
	err error
}

func (f *fakeStorer) UpsertSpotifyCredentials(_ context.Context, _ sqlc.UpsertSpotifyCredentialsParams) (sqlc.SpotifyCredential, error) {
	if f.err != nil {
		return sqlc.SpotifyCredential{}, f.err
	}
	return sqlc.SpotifyCredential{
		UserID:      "user1",
		AccessToken: "acc",
		Scopes:      "user-read-playback-state",
		LastRefreshedAt: pgtype.Timestamptz{Valid: false},
	}, nil
}

// buildRouter constructs a Gin engine with the Spotify handler wired under
// /api. The userID is injected as a fake auth claim so tests don't need a
// real JWT.
func buildRouter(t *testing.T, spotifyClient *spotify.Client, store handlers.SpotifyStorer, userID string) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	api := r.Group("/api")
	// Inject a fake auth claim so auth.UserID(c) returns userID.
	api.Use(func(c *gin.Context) {
		c.Set("auth.user_id", userID)
		c.Next()
	})
	handlers.RegisterSpotifyWithStorer(api, spotifyClient, store)
	return r
}

func newSpotifyStub(t *testing.T, statusCode int, body []byte) (*httptest.Server, *spotify.Client) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)

	key := make([]byte, tokencrypto.KeySize)
	client := spotify.NewClientWithEndpoint("cid", "csec", "http://localhost/cb", key, srv.URL)
	return srv, client
}

func spotifySuccessBody(t *testing.T) []byte {
	t.Helper()
	b, err := json.Marshal(map[string]any{
		"access_token":  "spotify_acc",
		"token_type":    "Bearer",
		"expires_in":    3600,
		"refresh_token": "spotify_ref",
		"scope":         "user-read-playback-state",
	})
	require.NoError(t, err)
	return b
}

func postJSON(t *testing.T, r *gin.Engine, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	payload, err := json.Marshal(body)
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestSpotifyHandler_HappyPath(t *testing.T) {
	_, client := newSpotifyStub(t, http.StatusOK, spotifySuccessBody(t))
	store := &fakeStorer{}
	r := buildRouter(t, client, store, "user1")

	w := postJSON(t, r, "/api/spotify/token", map[string]string{
		"code":        "authcode",
		"redirectUri": "http://localhost/cb",
	})

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "spotify_acc", resp["accessToken"])
	assert.Equal(t, float64(3600), resp["expiresIn"])
	assert.Equal(t, "user-read-playback-state", resp["scopes"])
	assert.NotContains(t, resp, "refreshToken", "refresh token must not appear in the response")
}

func TestSpotifyHandler_MissingCode(t *testing.T) {
	_, client := newSpotifyStub(t, http.StatusOK, spotifySuccessBody(t))
	r := buildRouter(t, client, &fakeStorer{}, "user1")

	w := postJSON(t, r, "/api/spotify/token", map[string]string{
		"redirectUri": "http://localhost/cb",
	})

	assert.Equal(t, http.StatusBadRequest, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "missing_field", resp["code"])
}

func TestSpotifyHandler_MissingRedirectURI(t *testing.T) {
	_, client := newSpotifyStub(t, http.StatusOK, spotifySuccessBody(t))
	r := buildRouter(t, client, &fakeStorer{}, "user1")

	w := postJSON(t, r, "/api/spotify/token", map[string]string{
		"code": "authcode",
	})

	assert.Equal(t, http.StatusBadRequest, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "missing_field", resp["code"])
}

func TestSpotifyHandler_SpotifyError(t *testing.T) {
	_, client := newSpotifyStub(t, http.StatusBadRequest, []byte(`{"error":"invalid_grant"}`))
	r := buildRouter(t, client, &fakeStorer{}, "user1")

	w := postJSON(t, r, "/api/spotify/token", map[string]string{
		"code":        "badcode",
		"redirectUri": "http://localhost/cb",
	})

	assert.Equal(t, http.StatusBadGateway, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "spotify_exchange_failed", resp["code"])
	// verify Spotify's raw error body is not leaked
	assert.NotContains(t, w.Body.String(), "invalid_grant")
}

func TestSpotifyHandler_DBError(t *testing.T) {
	_, client := newSpotifyStub(t, http.StatusOK, spotifySuccessBody(t))
	store := &fakeStorer{err: assert.AnError}
	r := buildRouter(t, client, store, "user1")

	w := postJSON(t, r, "/api/spotify/token", map[string]string{
		"code":        "authcode",
		"redirectUri": "http://localhost/cb",
	})

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "internal_error", resp["code"])
}
