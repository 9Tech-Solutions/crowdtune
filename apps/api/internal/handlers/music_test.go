package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/db/sqlc"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/spotify"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/tokencrypto"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

type fakeMusicStore struct {
	creds    sqlc.SpotifyCredential
	seenUser string
	updated  *sqlc.UpsertSpotifyCredentialsParams
}

func (f *fakeMusicStore) GetParty(context.Context, string) (sqlc.Party, error) {
	return sqlc.Party{HostUserID: "host"}, nil
}
func (f *fakeMusicStore) GetSpotifyCredentialsByUserID(_ context.Context, id string) (sqlc.SpotifyCredential, error) {
	f.seenUser = id
	return f.creds, nil
}
func (f *fakeMusicStore) UpsertSpotifyCredentials(_ context.Context, p sqlc.UpsertSpotifyCredentialsParams) (sqlc.SpotifyCredential, error) {
	f.updated = &p
	f.creds.AccessToken = p.AccessToken
	f.creds.AccessTokenExpiresAt = p.AccessTokenExpiresAt
	f.creds.RefreshTokenEncrypted = p.RefreshTokenEncrypted
	return f.creds, nil
}

func TestMusicTokenUsesAuthenticatedIdentityAndKeepsServerSecretsPrivate(t *testing.T) {
	key := make([]byte, 32)
	store := &fakeMusicStore{creds: sqlc.SpotifyCredential{AccessToken: "own-token", AccessTokenExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true}}}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	api := router.Group("/api")
	api.Use(func(c *gin.Context) { c.Set("auth.user_id", "own-user") })
	RegisterMusicWithStorer(api, store, MusicConfig{Spotify: spotify.NewClient("client", "server-secret", "https://example.test/spotify/callback", key), SpotifyClientID: "client", AppleDeveloperToken: "public-sdk-token", YouTubeAPIKey: "server-youtube-key"})
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/music/spotify/access-token?userId=another-user", nil))
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "own-user", store.seenUser)
	require.Contains(t, w.Body.String(), "own-token")
	require.Equal(t, "no-store", w.Header().Get("Cache-Control"))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/music/config", nil))
	require.Equal(t, http.StatusOK, w.Code)
	require.Contains(t, w.Body.String(), "public-sdk-token")
	require.NotContains(t, w.Body.String(), "server-secret")
	require.NotContains(t, w.Body.String(), "server-youtube-key")
}

func TestMusicRefreshPersistsRotatedEncryptedToken(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, r.ParseForm())
		require.Equal(t, "old-refresh", r.Form.Get("refresh_token"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"access_token":"new-access","expires_in":3600,"refresh_token":"new-refresh"}`))
	}))
	defer server.Close()
	key := make([]byte, 32)
	encrypted, err := tokencrypto.Encrypt(key, "old-refresh")
	require.NoError(t, err)
	store := &fakeMusicStore{creds: sqlc.SpotifyCredential{RefreshTokenEncrypted: encrypted}}
	h := musicHandler{store: store, cfg: MusicConfig{Spotify: spotify.NewClientWithEndpoint("client", "secret", "https://example.test/spotify/callback", key, server.URL)}}
	creds, err := h.accessToken(context.Background(), "own-user")
	require.NoError(t, err)
	require.Equal(t, "new-access", creds.AccessToken)
	require.NotNil(t, store.updated)
	refresh, err := tokencrypto.Decrypt(key, store.updated.RefreshTokenEncrypted)
	require.NoError(t, err)
	require.Equal(t, "new-refresh", refresh)
	require.Equal(t, "own-user", store.updated.UserID)
}
