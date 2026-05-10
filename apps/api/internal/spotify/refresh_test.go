package spotify_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/spotify"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func spotifyRefreshBody(accessToken, newRefreshToken string, expiresIn int) []byte {
	body := map[string]any{
		"access_token": accessToken,
		"token_type":   "Bearer",
		"expires_in":   expiresIn,
	}
	if newRefreshToken != "" {
		body["refresh_token"] = newRefreshToken
	}
	b, _ := json.Marshal(body)
	return b
}

func TestRefreshAccessToken_HappyPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, r.ParseForm())
		assert.Equal(t, "refresh_token", r.FormValue("grant_type"))
		assert.Equal(t, "plainrefresh", r.FormValue("refresh_token"))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(spotifyRefreshBody("newacc", "", 3600))
	}))
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	result, err := client.RefreshAccessToken(context.Background(), "plainrefresh")

	require.NoError(t, err)
	assert.Equal(t, "newacc", result.AccessToken)
	assert.Equal(t, 3600, result.ExpiresIn)
	assert.Empty(t, result.NewRefreshToken, "Spotify did not rotate; field must be empty")
}

func TestRefreshAccessToken_NoNewRefreshToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(spotifyRefreshBody("acc", "", 1800))
	}))
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	result, err := client.RefreshAccessToken(context.Background(), "anytoken")

	require.NoError(t, err)
	assert.Empty(t, result.NewRefreshToken)
}

func TestRefreshAccessToken_WithNewRefreshToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(spotifyRefreshBody("acc", "rotated_refresh", 3600))
	}))
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	result, err := client.RefreshAccessToken(context.Background(), "oldtoken")

	require.NoError(t, err)
	assert.Equal(t, "acc", result.AccessToken)
	assert.Equal(t, "rotated_refresh", result.NewRefreshToken)
}

func TestRefreshAccessToken_4xxNoRetry(t *testing.T) {
	attempts := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	_, err := client.RefreshAccessToken(context.Background(), "expiredtoken")

	require.ErrorIs(t, err, spotify.ErrSpotifyBadRequest)
	assert.Equal(t, 1, attempts, "4xx must not trigger a retry")
}

func TestRefreshAccessToken_5xxFirstThenSuccess(t *testing.T) {
	call := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		call++
		if call == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(spotifyRefreshBody("acc_retry", "", 3600))
	}))
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	result, err := client.RefreshAccessToken(context.Background(), "tok")

	require.NoError(t, err)
	assert.Equal(t, "acc_retry", result.AccessToken)
	assert.Equal(t, 2, call)
}

func TestRefreshAccessToken_5xxBothAttempts(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	_, err := client.RefreshAccessToken(context.Background(), "tok")

	require.Error(t, err)
}

func TestRefreshAccessToken_NetworkError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	srv.Close()

	client := newTestClient(t, srv.URL)
	_, err := client.RefreshAccessToken(context.Background(), "tok")

	require.Error(t, err)
}

func TestRefreshAccessToken_ContextCancellation(t *testing.T) {
	// Use a pre-cancelled context. The request should fail immediately.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(spotifyRefreshBody("a", "", 3600))
	}))
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	_, err := client.RefreshAccessToken(ctx, "tok")

	require.Error(t, err)
}
