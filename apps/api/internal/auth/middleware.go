package auth

import (
	"net/http"
	"strings"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type ctxKey string

const (
	ctxKeyUserID ctxKey = "auth.user_id"
	ctxKeyEmail  ctxKey = "auth.email"
	ctxKeyRole   ctxKey = "auth.role"
)

type Claims struct {
	Email string `json:"email,omitempty"`
	Role  string `json:"role,omitempty"`
	jwt.RegisteredClaims
}

func RequireUser(jwks keyfunc.Keyfunc, issuer, audience string) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":    "missing_bearer",
				"message": "Authorization header must be 'Bearer <jwt>'",
			})
			return
		}
		raw := strings.TrimPrefix(header, "Bearer ")

		claims := &Claims{}
		opts := []jwt.ParserOption{jwt.WithIssuedAt()}
		if issuer != "" {
			opts = append(opts, jwt.WithIssuer(issuer))
		}
		if audience != "" {
			opts = append(opts, jwt.WithAudience(audience))
		}

		token, err := jwt.ParseWithClaims(raw, claims, jwks.Keyfunc, opts...)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":    "invalid_token",
				"message": err.Error(),
			})
			return
		}
		if !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":    "invalid_token",
				"message": "token rejected",
			})
			return
		}
		if claims.Subject == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":    "invalid_token",
				"message": "sub claim is missing",
			})
			return
		}

		c.Set(string(ctxKeyUserID), claims.Subject)
		c.Set(string(ctxKeyEmail), claims.Email)
		c.Set(string(ctxKeyRole), claims.Role)
		c.Next()
	}
}

func UserID(c *gin.Context) string {
	v, _ := c.Get(string(ctxKeyUserID))
	s, _ := v.(string)
	return s
}

func Email(c *gin.Context) string {
	v, _ := c.Get(string(ctxKeyEmail))
	s, _ := v.(string)
	return s
}

func Role(c *gin.Context) string {
	v, _ := c.Get(string(ctxKeyRole))
	s, _ := v.(string)
	return s
}
