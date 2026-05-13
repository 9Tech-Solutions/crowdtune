package handlers_test

// Wiring regression test for the bearer-JWT bypass class.
//
// Background: Phase 10's /security-review caught a CRITICAL bypass where
// auth.RequireUser was attached per-route on /me only and the /api group
// itself had no Use() call, so /api/parties, /api/parties/:id/tracks,
// /api/parties/:id/tracks/:provider/:trackId/vote, and /api/spotify/token
// were all unauthenticated in production. Fixed at 5fda177 by mounting
// api.Use(auth.RequireUser(...)) at the group level.
//
// This test rebuilds the production wiring pattern (group + middleware +
// every Register* call) and verifies that every protected endpoint returns
// 401 missing_bearer on an unauthenticated request. If someone removes the
// group-level Use() or accidentally mounts a public route on the protected
// group, this test fails before it ships.
//
// The test does NOT exercise handler bodies; it only verifies the auth
// chain runs before handlers. Nil dependencies (pool, spotify.Client) are
// safe because the middleware aborts the request before any handler is
// invoked.

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/auth"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/handlers"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const wiringTestKID = "wiring-test-kid"

// buildWiringRouter mirrors cmd/api/main.go's protected-group wiring. The
// router is the same shape production builds: bearer auth at the group
// level, then every protected handler registered without re-attaching
// middleware.
func buildWiringRouter(t *testing.T) (*gin.Engine, func()) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	// Spin up a real JWKS test server so auth.NewJWKS succeeds. The test
	// never sends a signed token; the bypass-class regression only needs
	// the "missing Bearer" branch of RequireUser, which aborts before any
	// JWKS lookup. A working keyfunc is still required to construct the
	// middleware itself.
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	jwksSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(wiringJWKSJSON(t, &priv.PublicKey, wiringTestKID)))
	}))

	jwks, err := auth.NewJWKS(jwksSrv.URL)
	require.NoError(t, err)

	router := gin.New()
	api := router.Group("/api")
	api.Use(auth.RequireUser(jwks, "https://issuer.test", "crowdtune-test"))

	// Register every handler the production main.go mounts. Nil pool and
	// nil spotify.Client are safe: the middleware aborts before handler
	// bodies run, so no DB or external-API calls fire.
	handlers.RegisterMe(api)
	handlers.RegisterParties(api, nil)
	handlers.RegisterQueue(api, nil)
	handlers.RegisterVotes(api, nil)
	handlers.RegisterSpotify(api, nil, nil)

	cleanup := func() { jwksSrv.Close() }
	return router, cleanup
}

func wiringJWKSJSON(t *testing.T, pub *rsa.PublicKey, kid string) string {
	t.Helper()
	n := base64.RawURLEncoding.EncodeToString(pub.N.Bytes())
	e := base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pub.E)).Bytes())
	body, err := json.Marshal(map[string]any{
		"keys": []map[string]any{{
			"kty": "RSA",
			"alg": "RS256",
			"use": "sig",
			"kid": kid,
			"n":   n,
			"e":   e,
		}},
	})
	require.NoError(t, err)
	return string(body)
}

// TestWiring_AllProtectedEndpointsRequireBearer is the regression guard.
// It walks every endpoint mounted under /api and asserts the auth chain
// rejects unauthenticated callers with 401 missing_bearer. The list of
// endpoints must be kept in sync with the production main.go wiring;
// adding a new protected endpoint and forgetting to update this list is
// itself a signal worth catching in review.
func TestWiring_AllProtectedEndpointsRequireBearer(t *testing.T) {
	router, cleanup := buildWiringRouter(t)
	defer cleanup()

	endpoints := []struct {
		method, path string
	}{
		{http.MethodGet, "/api/me"},
		{http.MethodPost, "/api/parties"},
		{http.MethodGet, "/api/parties/anycode"},
		{http.MethodGet, "/api/parties/anycode/tracks"},
		{http.MethodPut, "/api/parties/anycode/tracks/spotify/anytrack/vote"},
		{http.MethodDelete, "/api/parties/anycode/tracks/spotify/anytrack/vote"},
		{http.MethodPost, "/api/spotify/token"},
	}

	for _, ep := range endpoints {
		t.Run(ep.method+" "+ep.path, func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.path, nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			require.Equal(t, http.StatusUnauthorized, w.Code,
				"endpoint %s %s must reject unauthenticated callers; body=%s",
				ep.method, ep.path, w.Body.String())

			var body map[string]string
			require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
			assert.Equal(t, "missing_bearer", body["code"],
				"endpoint %s %s must return code=missing_bearer", ep.method, ep.path)
		})
	}
}

// TestWiring_WrongAuthScheme_StillRejected covers a sibling bypass class
// where a non-Bearer Authorization header reaches the handler. The
// middleware should reject it identically to missing.
func TestWiring_WrongAuthScheme_StillRejected(t *testing.T) {
	router, cleanup := buildWiringRouter(t)
	defer cleanup()

	req := httptest.NewRequest(http.MethodPost, "/api/parties", nil)
	req.Header.Set("Authorization", "Basic dXNlcjpwYXNz")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusUnauthorized, w.Code)
	var body map[string]string
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, "missing_bearer", body["code"])
}
