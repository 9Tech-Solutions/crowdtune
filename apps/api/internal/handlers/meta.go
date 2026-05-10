package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

const apiVersion = "0.0.0"

type metaHandler struct {
	pool *pgxpool.Pool
}

func RegisterMeta(r *gin.Engine, pool *pgxpool.Pool) {
	h := &metaHandler{pool: pool}
	r.GET("/healthz", h.health)
}

func (h *metaHandler) health(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	dbStatus := "ok"
	if err := h.pool.Ping(ctx); err != nil {
		dbStatus = "down"
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"code":    "db_unavailable",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"db":      dbStatus,
		"version": apiVersion,
	})
}
