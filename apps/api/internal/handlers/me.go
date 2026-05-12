package handlers

import (
	"net/http"

	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/auth"
	"github.com/gin-gonic/gin"
)

// RegisterMe mounts /me on the given group. The group is expected to already
// have auth.RequireUser installed at the group level (see cmd/api/main.go),
// so this handler does not re-attach the middleware per-route.
func RegisterMe(r *gin.RouterGroup) {
	r.GET("/me", me)
}

func me(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"user_id": auth.UserID(c),
		"email":   auth.Email(c),
		"role":    auth.Role(c),
	})
}
