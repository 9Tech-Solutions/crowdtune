package handlers

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/auth"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/db/sqlc"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/spotify"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/tokencrypto"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SpotifyStorer is the minimal DB surface that the Spotify handler requires.
// The interface is satisfied by *sqlc.Queries; tests inject a fake.
type SpotifyStorer interface {
	UpsertSpotifyCredentials(ctx context.Context, arg sqlc.UpsertSpotifyCredentialsParams) (sqlc.SpotifyCredential, error)
}

type spotifyHandler struct {
	client *spotify.Client
	store  SpotifyStorer
}

// RegisterSpotify mounts the Spotify token-exchange route on the given group.
// It uses pool to construct the default sqlc.Queries storer.
func RegisterSpotify(r *gin.RouterGroup, spotifyClient *spotify.Client, pool *pgxpool.Pool) {
	h := &spotifyHandler{
		client: spotifyClient,
		store:  sqlc.New(pool),
	}
	r.POST("/spotify/token", h.exchangeToken)
}

// RegisterSpotifyWithStorer is the testable variant that accepts an injected storer.
func RegisterSpotifyWithStorer(r *gin.RouterGroup, spotifyClient *spotify.Client, store SpotifyStorer) {
	h := &spotifyHandler{
		client: spotifyClient,
		store:  store,
	}
	r.POST("/spotify/token", h.exchangeToken)
}

type exchangeTokenRequest struct {
	Code        string `json:"code"`
	RedirectURI string `json:"redirectUri"`
}

type exchangeTokenResponse struct {
	AccessToken string `json:"accessToken"`
	ExpiresIn   int    `json:"expiresIn"`
	Scopes      string `json:"scopes"`
}

func (h *spotifyHandler) exchangeToken(c *gin.Context) {
	userID := auth.UserID(c)

	var req exchangeTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		slog.Info("spotify token exchange", "user_id", userID, "outcome", "bad_request", "reason", "invalid_json")
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    "missing_field",
			"message": "request body must be valid JSON with 'code' and 'redirectUri' fields",
		})
		return
	}

	if req.Code == "" {
		slog.Info("spotify token exchange", "user_id", userID, "outcome", "bad_request", "reason", "missing_code")
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    "missing_field",
			"message": "'code' is required",
		})
		return
	}
	if req.RedirectURI == "" {
		slog.Info("spotify token exchange", "user_id", userID, "outcome", "bad_request", "reason", "missing_redirect_uri")
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    "missing_field",
			"message": "'redirectUri' is required",
		})
		return
	}

	creds, err := h.client.ExchangeCode(c.Request.Context(), spotify.ExchangeInput{
		Code:        req.Code,
		RedirectURI: req.RedirectURI,
	})
	if err != nil {
		slog.Info("spotify token exchange", "user_id", userID, "outcome", "spotify_error")
		c.JSON(http.StatusBadGateway, gin.H{
			"code":    "spotify_exchange_failed",
			"message": "Spotify token exchange failed; please retry the authorization flow",
		})
		return
	}

	encryptedRefresh, err := tokencrypto.Encrypt(h.client.EncKey(), creds.RefreshToken)
	if err != nil {
		slog.Error("spotify token exchange", "user_id", userID, "outcome", "encrypt_error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    "internal_error",
			"message": "failed to secure token; please try again",
		})
		return
	}

	expiresAt := pgtype.Timestamptz{
		Time:  time.Now().Add(time.Duration(creds.ExpiresIn) * time.Second),
		Valid: true,
	}
	noRefreshedAt := pgtype.Timestamptz{Valid: false} // initial exchange; never refreshed yet

	_, err = h.store.UpsertSpotifyCredentials(c.Request.Context(), sqlc.UpsertSpotifyCredentialsParams{
		UserID:                userID,
		AccessToken:           creds.AccessToken,
		AccessTokenExpiresAt:  expiresAt,
		RefreshTokenEncrypted: encryptedRefresh,
		Scopes:                creds.Scopes,
		LastRefreshedAt:       noRefreshedAt,
	})
	if err != nil {
		slog.Error("spotify token exchange", "user_id", userID, "outcome", "db_error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    "internal_error",
			"message": "failed to store credentials; please try again",
		})
		return
	}

	slog.Info("spotify token exchange", "user_id", userID, "outcome", "ok")
	c.JSON(http.StatusOK, exchangeTokenResponse{
		AccessToken: creds.AccessToken,
		ExpiresIn:   creds.ExpiresIn,
		Scopes:      creds.Scopes,
	})
}
