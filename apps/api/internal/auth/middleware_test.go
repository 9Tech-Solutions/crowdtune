package auth_test

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/auth"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
)

const (
	testIssuer   = "https://issuer.test"
	testAudience = "crowdtune-test"
	testKID      = "test-kid"
	testSub      = "user_abc123"
	testEmail    = "alice@example.com"
)

func init() {
	gin.SetMode(gin.TestMode)
}

type testEnv struct {
	priv      *rsa.PrivateKey
	jwksSrv   *httptest.Server
	router    *gin.Engine
	cleanup   func()
	jwksHits  int
}

func setup(t *testing.T) *testEnv {
	t.Helper()

	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	jwksJSON := mustJWKSJSON(t, &priv.PublicKey, testKID)

	env := &testEnv{priv: priv}
	env.jwksSrv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		env.jwksHits++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(jwksJSON))
	}))

	jwks, err := auth.NewJWKS(env.jwksSrv.URL)
	require.NoError(t, err)

	r := gin.New()
	r.GET("/protected", auth.RequireUser(jwks, testIssuer, testAudience), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"user_id": auth.UserID(c),
			"email":   auth.Email(c),
		})
	})
	env.router = r
	env.cleanup = env.jwksSrv.Close
	return env
}

func mustJWKSJSON(t *testing.T, pub *rsa.PublicKey, kid string) string {
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

func makeToken(t *testing.T, priv *rsa.PrivateKey, claims jwt.Claims, kid string) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = kid
	signed, err := tok.SignedString(priv)
	require.NoError(t, err)
	return signed
}

func defaultClaims() *auth.Claims {
	return &auth.Claims{
		Email: testEmail,
		Role:  "authenticated",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   testSub,
			Issuer:    testIssuer,
			Audience:  jwt.ClaimStrings{testAudience},
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-time.Minute)),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
		},
	}
}

func TestRequireUser(t *testing.T) {
	env := setup(t)
	defer env.cleanup()

	tests := []struct {
		name       string
		token      func() string
		header     string
		wantStatus int
		wantCode   string
	}{
		{
			name:       "happy path",
			token:      func() string { return makeToken(t, env.priv, defaultClaims(), testKID) },
			wantStatus: http.StatusOK,
		},
		{
			name:       "missing header",
			header:     "",
			wantStatus: http.StatusUnauthorized,
			wantCode:   "missing_bearer",
		},
		{
			name:       "wrong scheme",
			header:     "Basic abc123",
			wantStatus: http.StatusUnauthorized,
			wantCode:   "missing_bearer",
		},
		{
			name: "expired token",
			token: func() string {
				c := defaultClaims()
				c.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Minute))
				return makeToken(t, env.priv, c, testKID)
			},
			wantStatus: http.StatusUnauthorized,
			wantCode:   "invalid_token",
		},
		{
			name: "wrong issuer",
			token: func() string {
				c := defaultClaims()
				c.Issuer = "https://attacker.test"
				return makeToken(t, env.priv, c, testKID)
			},
			wantStatus: http.StatusUnauthorized,
			wantCode:   "invalid_token",
		},
		{
			name: "wrong audience",
			token: func() string {
				c := defaultClaims()
				c.Audience = jwt.ClaimStrings{"some-other-app"}
				return makeToken(t, env.priv, c, testKID)
			},
			wantStatus: http.StatusUnauthorized,
			wantCode:   "invalid_token",
		},
		{
			name: "missing sub",
			token: func() string {
				c := defaultClaims()
				c.Subject = ""
				return makeToken(t, env.priv, c, testKID)
			},
			wantStatus: http.StatusUnauthorized,
			wantCode:   "invalid_token",
		},
		{
			name: "unknown kid",
			token: func() string {
				return makeToken(t, env.priv, defaultClaims(), "unknown-kid")
			},
			wantStatus: http.StatusUnauthorized,
			wantCode:   "invalid_token",
		},
		{
			name: "tampered signature",
			token: func() string {
				good := makeToken(t, env.priv, defaultClaims(), testKID)
				return good[:len(good)-4] + "AAAA"
			},
			wantStatus: http.StatusUnauthorized,
			wantCode:   "invalid_token",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/protected", nil)
			switch {
			case tc.header != "":
				req.Header.Set("Authorization", tc.header)
			case tc.token != nil:
				req.Header.Set("Authorization", "Bearer "+tc.token())
			}
			w := httptest.NewRecorder()
			env.router.ServeHTTP(w, req)

			require.Equal(t, tc.wantStatus, w.Code, "body=%s", w.Body.String())

			if tc.wantStatus == http.StatusOK {
				var body map[string]string
				require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
				require.Equal(t, testSub, body["user_id"])
				require.Equal(t, testEmail, body["email"])
				return
			}

			var errBody map[string]string
			require.NoError(t, json.Unmarshal(w.Body.Bytes(), &errBody))
			require.Equal(t, tc.wantCode, errBody["code"])
		})
	}
}

func TestNewJWKS_EmptyURL(t *testing.T) {
	_, err := auth.NewJWKS("")
	require.ErrorIs(t, err, auth.ErrJWKSNotConfigured)
}
