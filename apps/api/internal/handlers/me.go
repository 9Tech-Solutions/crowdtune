package handlers

import (
	"net/http"

	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/auth"
	"github.com/MicahParks/keyfunc/v3"
	"github.com/gin-gonic/gin"
)

func RegisterMe(r *gin.RouterGroup, jwks keyfunc.Keyfunc, issuer, audience string) {
	r.GET("/me", auth.RequireUser(jwks, issuer, audience), me)
}

func me(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"user_id": auth.UserID(c),
		"email":   auth.Email(c),
		"role":    auth.Role(c),
	})
}
