package spotify_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/spotify"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/tokencrypto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestClient(t *testing.T, serverURL string) *spotify.Client {
	t.Helper()
	key := make([]byte, tokencrypto.KeySize)
	return spotify.NewClientWithEndpoint("test-id", "test-secret", "http://localhost/cb", key, serverURL)
}

func spotifyTokenBody(t *testing.T, accessToken, refreshToken string, expiresIn int, scope string) []byte {
	t.Helper()
	b, err := json.Marshal(map[string]any{
		"access_token":  accessToken,
		"token_type":    "Bearer",
		"expires_in":    expiresIn,
		"refresh_token": refreshToken,
		"scope":         scope,
	})
	require.NoError(t, err)
	return b
}

func TestExchangeCode_HappyPath(t *testing.T) {
	body := spotifyTokenBody(t, "acc123", "ref456", 3600, "user-read-playback-state")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "application/x-www-form-urlencoded", r.Header.Get("Content-Type"))
		assert.Contains(t, r.Header.Get("Authorization"), "Basic ")
		require.NoError(t, r.ParseForm())
		assert.Equal(t, "authorization_code", r.FormValue("grant_type"))
		assert.Equal(t, "mycode", r.FormValue("code"))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	}))
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	creds, err := client.ExchangeCode(context.Background(), spotify.ExchangeInput{
		Code:        "mycode",
		RedirectURI: "http://localhost/cb",
	})

	require.NoError(t, err)
	assert.Equal(t, "acc123", creds.AccessToken)
	assert.Equal(t, "ref456", creds.RefreshToken)
	assert.Equal(t, 3600, creds.ExpiresIn)
	assert.Equal(t, "user-read-playback-state", creds.Scopes)
}

func TestExchangeCode_4xxNoRetry(t *testing.T) {
	attempts := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	_, err := client.ExchangeCode(context.Background(), spotify.ExchangeInput{Code: "bad", RedirectURI: "x"})

	require.ErrorIs(t, err, spotify.ErrSpotifyBadRequest)
	assert.Equal(t, 1, attempts, "4xx must not trigger a retry")
}

func TestExchangeCode_5xxFirstThenSuccess(t *testing.T) {
	body := spotifyTokenBody(t, "acc_retry", "ref_retry", 3600, "")
	call := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		call++
		if call == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	}))
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	creds, err := client.ExchangeCode(context.Background(), spotify.ExchangeInput{Code: "c", RedirectURI: "x"})

	require.NoError(t, err)
	assert.Equal(t, "acc_retry", creds.AccessToken)
	assert.Equal(t, 2, call, "should have retried once after 5xx")
}

func TestExchangeCode_5xxBothAttempts(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	_, err := client.ExchangeCode(context.Background(), spotify.ExchangeInput{Code: "c", RedirectURI: "x"})

	require.Error(t, err)
}

func TestExchangeCode_NetworkError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	srv.Close() // close immediately so the request fails

	client := newTestClient(t, srv.URL)
	_, err := client.ExchangeCode(context.Background(), spotify.ExchangeInput{Code: "c", RedirectURI: "x"})

	require.Error(t, err)
}

func TestExchangeCode_ContextCancellation(t *testing.T) {
	// Use a pre-cancelled context. The request should fail immediately without
	// even connecting to the server, so no blocking in the handler.
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel before the call

	body := spotifyTokenBody(t, "a", "r", 3600, "")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Should never be reached; context is already done.
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	}))
	defer srv.Close()

	client := newTestClient(t, srv.URL)
	_, err := client.ExchangeCode(ctx, spotify.ExchangeInput{Code: "c", RedirectURI: "x"})

	require.Error(t, err)
}
