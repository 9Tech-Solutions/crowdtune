package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/auth"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/db/sqlc"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const maxPartyIDRetries = 5

// pgErrUniqueViolation is the PostgreSQL SQLSTATE code for unique_violation.
const pgErrUniqueViolation = "23505"

// PartiesStorer is the minimal DB surface that the parties handler requires.
// Satisfied by *sqlc.Queries; tests inject a fake.
type PartiesStorer interface {
	CreateParty(ctx context.Context, arg sqlc.CreatePartyParams) (sqlc.Party, error)
	GetParty(ctx context.Context, id string) (sqlc.Party, error)
}

type partiesHandler struct {
	store PartiesStorer
}

// RegisterParties mounts the parties routes on the given group using the pool.
func RegisterParties(r *gin.RouterGroup, pool *pgxpool.Pool) {
	RegisterPartiesWithStorer(r, sqlc.New(pool))
}

// RegisterPartiesWithStorer is the testable variant that accepts an injected storer.
func RegisterPartiesWithStorer(r *gin.RouterGroup, store PartiesStorer) {
	h := &partiesHandler{store: store}
	r.POST("/parties", h.createParty)
	r.GET("/parties/:partyId", h.getParty)
}

// partyResponse is the shared response shape for both create and get operations.
type partyResponse struct {
	ID         string                 `json:"id"`
	ShortID    string                 `json:"shortId"`
	Name       string                 `json:"name"`
	HostUserID string                 `json:"hostUserId"`
	Settings   map[string]interface{} `json:"settings"`
	IsActive   bool                   `json:"isActive"`
	CreatedAt  string                 `json:"createdAt"`
	UpdatedAt  string                 `json:"updatedAt"`
}

type createPartyRequest struct {
	Name     string                 `json:"name"`
	Settings map[string]interface{} `json:"settings"`
}

func (h *partiesHandler) createParty(c *gin.Context) {
	userID := auth.UserID(c)

	var req createPartyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		slog.Info("create_party", "user_id", userID, "outcome", "bad_request", "reason", "invalid_json")
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    "missing_field",
			"message": "request body must be valid JSON",
		})
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		slog.Info("create_party", "user_id", userID, "outcome", "bad_request", "reason", "missing_name")
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    "missing_field",
			"message": "'name' is required and must be non-empty",
		})
		return
	}

	settingsJSON, err := marshalSettings(req.Settings)
	if err != nil {
		slog.Info("create_party", "user_id", userID, "outcome", "bad_request", "reason", "invalid_settings")
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    "missing_field",
			"message": "settings must be a valid JSON object",
		})
		return
	}

	party, err := h.insertWithRetry(c.Request.Context(), userID, req.Name, settingsJSON)
	if err != nil {
		slog.Info("create_party", "user_id", userID, "outcome", "db_error")
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    "internal_error",
			"message": "failed to create party; please try again",
		})
		return
	}

	slog.Info("create_party", "user_id", userID, "outcome", "ok", "party_id", party.ID)
	c.JSON(http.StatusCreated, toPartyResponse(party))
}

func (h *partiesHandler) getParty(c *gin.Context) {
	userID := auth.UserID(c)
	partyID := c.Param("partyId")

	party, err := h.store.GetParty(c.Request.Context(), partyID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			slog.Info("get_party", "user_id", userID, "outcome", "not_found", "party_id", partyID)
			c.JSON(http.StatusNotFound, gin.H{
				"code":    "party_not_found",
				"message": "party not found",
			})
			return
		}
		slog.Info("get_party", "user_id", userID, "outcome", "db_error", "party_id", partyID)
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    "internal_error",
			"message": "failed to retrieve party; please try again",
		})
		return
	}

	slog.Info("get_party", "user_id", userID, "outcome", "ok", "party_id", partyID)
	c.JSON(http.StatusOK, toPartyResponse(party))
}

// insertWithRetry generates a short code, attempts an INSERT, and retries on
// PK uniqueness violations (SQLSTATE 23505). Returns the created Party row or
// an error after maxPartyIDRetries attempts.
func (h *partiesHandler) insertWithRetry(ctx context.Context, hostUserID, name string, settingsJSON []byte) (sqlc.Party, error) {
	for i := 0; i < maxPartyIDRetries; i++ {
		id, err := generateShortCode()
		if err != nil {
			return sqlc.Party{}, fmt.Errorf("generate short code: %w", err)
		}

		party, err := h.store.CreateParty(ctx, sqlc.CreatePartyParams{
			ID:         id,
			HostUserID: hostUserID,
			Name:       name,
			Settings:   settingsJSON,
		})
		if err == nil {
			return party, nil
		}

		if isUniqueViolation(err) {
			continue
		}
		return sqlc.Party{}, fmt.Errorf("create party: %w", err)
	}
	return sqlc.Party{}, fmt.Errorf("create party: exhausted %d id retries", maxPartyIDRetries)
}

// isUniqueViolation reports whether err is a PostgreSQL unique_violation (23505).
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == pgErrUniqueViolation
}

// marshalSettings converts the optional settings map to JSONB bytes.
// A nil map becomes the empty object {}.
func marshalSettings(settings map[string]interface{}) ([]byte, error) {
	if settings == nil {
		return []byte("{}"), nil
	}
	return json.Marshal(settings)
}

// toPartyResponse converts a sqlc.Party row to the JSON response shape.
func toPartyResponse(p sqlc.Party) partyResponse {
	settings := make(map[string]interface{})
	if len(p.Settings) > 0 {
		_ = json.Unmarshal(p.Settings, &settings)
	}
	return partyResponse{
		ID:         p.ID,
		ShortID:    p.ID,
		Name:       p.Name,
		HostUserID: p.HostUserID,
		Settings:   settings,
		IsActive:   p.IsActive,
		CreatedAt:  p.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:  p.UpdatedAt.Time.UTC().Format("2006-01-02T15:04:05Z07:00"),
	}
}
