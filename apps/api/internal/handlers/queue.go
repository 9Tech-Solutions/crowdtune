package handlers

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/auth"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/db/sqlc"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// QueueStorer is the minimal DB surface that the queue handler requires.
// Satisfied by *sqlc.Queries; tests inject a fake.
type QueueStorer interface {
	GetParty(ctx context.Context, id string) (sqlc.Party, error)
	ListQueueTracksByParty(ctx context.Context, partyID string) ([]sqlc.QueueTrack, error)
}

type queueHandler struct {
	store QueueStorer
}

// RegisterQueue mounts the queue routes on the given group using the pool.
func RegisterQueue(r *gin.RouterGroup, pool *pgxpool.Pool) {
	RegisterQueueWithStorer(r, sqlc.New(pool))
}

// RegisterQueueWithStorer is the testable variant that accepts an injected storer.
func RegisterQueueWithStorer(r *gin.RouterGroup, store QueueStorer) {
	h := &queueHandler{store: store}
	r.GET("/parties/:partyId/tracks", h.listQueueTracks)
}

// trackReference is the nested provider+id shape for a queue track response.
type trackReference struct {
	Provider string `json:"provider"`
	ID       string `json:"id"`
}

// queueTrackResponse is the JSON shape for a single queue track.
type queueTrackResponse struct {
	Reference  trackReference `json:"reference"`
	VoteCount  int32          `json:"voteCount"`
	OrderIdx   int64          `json:"orderIdx"`
	IsFallback bool           `json:"isFallback"`
	AddedAt    string         `json:"addedAt"`
}

// listQueueTracksResponse is the top-level response for GET /parties/:partyId/tracks.
type listQueueTracksResponse struct {
	Tracks []queueTrackResponse `json:"tracks"`
}

func (h *queueHandler) listQueueTracks(c *gin.Context) {
	userID := auth.UserID(c)
	partyID := c.Param("partyId")

	_, err := h.store.GetParty(c.Request.Context(), partyID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			slog.Info("list_queue", "user_id", userID, "outcome", "not_found", "party_id", partyID)
			c.JSON(http.StatusNotFound, gin.H{
				"code":    "party_not_found",
				"message": "party not found",
			})
			return
		}
		slog.Info("list_queue", "user_id", userID, "outcome", "db_error", "party_id", partyID)
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    "internal_error",
			"message": "failed to retrieve party; please try again",
		})
		return
	}

	rows, err := h.store.ListQueueTracksByParty(c.Request.Context(), partyID)
	if err != nil {
		slog.Info("list_queue", "user_id", userID, "outcome", "db_error", "party_id", partyID)
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    "internal_error",
			"message": "failed to retrieve queue; please try again",
		})
		return
	}

	tracks := toQueueTrackResponses(rows)
	slog.Info("list_queue", "user_id", userID, "outcome", "ok", "party_id", partyID, "track_count", len(tracks))
	c.JSON(http.StatusOK, listQueueTracksResponse{Tracks: tracks})
}

// toQueueTrackResponses converts sqlc rows to the JSON response shape.
func toQueueTrackResponses(rows []sqlc.QueueTrack) []queueTrackResponse {
	out := make([]queueTrackResponse, len(rows))
	for i, r := range rows {
		out[i] = queueTrackResponse{
			Reference: trackReference{
				Provider: r.Provider,
				ID:       r.ProviderTrackID,
			},
			VoteCount:  r.VoteCount,
			OrderIdx:   r.OrderIdx,
			IsFallback: r.IsFallback,
			AddedAt:    r.AddedAt.Time.UTC().Format(time.RFC3339),
		}
	}
	return out
}
