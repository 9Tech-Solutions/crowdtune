package handlers

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/auth"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/db/sqlc"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/music"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/spotify"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/tokencrypto"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type MusicConfig struct {
	Spotify                                                                                  *spotify.Client
	SpotifyClientID, SpotifyRedirectURI, AppleDeveloperToken, AppleStorefront, YouTubeAPIKey string
}
type MusicStorer interface {
	GetParty(context.Context, string) (sqlc.Party, error)
	GetSpotifyCredentialsByUserID(context.Context, string) (sqlc.SpotifyCredential, error)
	UpsertSpotifyCredentials(context.Context, sqlc.UpsertSpotifyCredentialsParams) (sqlc.SpotifyCredential, error)
}
type musicHandler struct {
	store     MusicStorer
	cfg       MusicConfig
	catalog   *music.Catalog
	refreshMu sync.Mutex
}

func RegisterMusic(r *gin.RouterGroup, pool *pgxpool.Pool, cfg MusicConfig) {
	RegisterMusicWithStorer(r, sqlc.New(pool), cfg)
}
func RegisterMusicWithStorer(r *gin.RouterGroup, store MusicStorer, cfg MusicConfig) {
	h := &musicHandler{store: store, cfg: cfg, catalog: music.NewCatalog(cfg.AppleDeveloperToken, cfg.AppleStorefront, cfg.YouTubeAPIKey)}
	r.GET("/music/config", h.config)
	r.GET("/music/spotify/access-token", h.spotifyToken)
	r.GET("/parties/:partyId/music/search", h.search)
	r.GET("/parties/:partyId/music/metadata", h.metadata)
}
func (h *musicHandler) config(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{
		"spotify":    gin.H{"configured": h.cfg.Spotify != nil, "clientId": h.cfg.SpotifyClientID, "redirectUri": h.cfg.SpotifyRedirectURI},
		"appleMusic": gin.H{"configured": h.cfg.AppleDeveloperToken != "", "developerToken": h.cfg.AppleDeveloperToken},
		"youtube":    gin.H{"configured": true, "searchConfigured": h.cfg.YouTubeAPIKey != ""},
	})
}
func (h *musicHandler) accessToken(ctx context.Context, userID string) (sqlc.SpotifyCredential, error) {
	if h.cfg.Spotify == nil {
		return sqlc.SpotifyCredential{}, music.ErrNotConfigured
	}
	// shortcut: refreshes serialize per API process; use a DB lock before running multiple instances.
	h.refreshMu.Lock()
	defer h.refreshMu.Unlock()
	creds, err := h.store.GetSpotifyCredentialsByUserID(ctx, userID)
	if err != nil {
		return creds, err
	}
	if creds.AccessTokenExpiresAt.Valid && time.Until(creds.AccessTokenExpiresAt.Time) > time.Minute {
		return creds, nil
	}
	refresh, err := tokencrypto.Decrypt(h.cfg.Spotify.EncKey(), creds.RefreshTokenEncrypted)
	if err != nil {
		return creds, err
	}
	next, err := h.cfg.Spotify.RefreshAccessToken(ctx, refresh)
	if err != nil {
		return creds, err
	}
	if next.AccessToken == "" || next.ExpiresIn <= 0 {
		return creds, errors.New("invalid Spotify refresh response")
	}
	encrypted := creds.RefreshTokenEncrypted
	if next.NewRefreshToken != "" {
		encrypted, err = tokencrypto.Encrypt(h.cfg.Spotify.EncKey(), next.NewRefreshToken)
		if err != nil {
			return creds, err
		}
	}
	return h.store.UpsertSpotifyCredentials(ctx, sqlc.UpsertSpotifyCredentialsParams{
		UserID: userID, AccessToken: next.AccessToken, AccessTokenExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Duration(next.ExpiresIn) * time.Second), Valid: true}, RefreshTokenEncrypted: encrypted, Scopes: creds.Scopes, LastRefreshedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
	})
}
func (h *musicHandler) spotifyToken(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	creds, err := h.accessToken(c.Request.Context(), auth.UserID(c))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, music.ErrNotConfigured) {
			c.JSON(http.StatusConflict, gin.H{"code": "spotify_not_connected", "message": "Connect Spotify before playback."})
		} else {
			c.JSON(http.StatusBadGateway, gin.H{"code": "spotify_token_failed", "message": "Reconnect Spotify to refresh playback access."})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"accessToken": creds.AccessToken, "expiresIn": int(time.Until(creds.AccessTokenExpiresAt.Time).Seconds())})
}
func (h *musicHandler) catalogContext(c *gin.Context) (string, string, bool) {
	provider := c.Query("provider")
	if !music.ValidProvider(provider) {
		c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_provider", "message": "Choose Spotify, Apple Music, or YouTube."})
		return "", "", false
	}
	party, err := h.store.GetParty(c.Request.Context(), c.Param("partyId"))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"code": "party_not_found", "message": "Party not found."})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "Could not load the party."})
		}
		return "", "", false
	}
	token := ""
	if provider == "spotify" {
		creds, err := h.accessToken(c.Request.Context(), party.HostUserID)
		if err != nil {
			c.JSON(http.StatusConflict, gin.H{"code": "spotify_not_connected", "message": "The host must connect Spotify first."})
			return "", "", false
		}
		token = creds.AccessToken
	}
	return provider, token, true
}
func (h *musicHandler) search(c *gin.Context) {
	q := c.Query("q")
	if len(q) == 0 || len(q) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_query", "message": "Enter a search query of 1–200 characters."})
		return
	}
	provider, token, ok := h.catalogContext(c)
	if !ok {
		return
	}
	results, err := h.catalog.Search(c.Request.Context(), provider, q, token)
	if err != nil {
		h.catalogError(c, err)
		return
	}
	c.JSON(http.StatusOK, results)
}
func (h *musicHandler) metadata(c *gin.Context) {
	if !music.ValidReference(c.Query("provider"), c.Query("id")) {
		c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_reference", "message": "Invalid track reference."})
		return
	}
	provider, token, ok := h.catalogContext(c)
	if !ok {
		return
	}
	metadata, err := h.catalog.Track(c.Request.Context(), music.Reference{Provider: provider, ID: c.Query("id")}, token)
	if err != nil {
		h.catalogError(c, err)
		return
	}
	c.JSON(http.StatusOK, metadata)
}
func (h *musicHandler) catalogError(c *gin.Context, err error) {
	if errors.Is(err, music.ErrNotConfigured) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": "provider_not_configured", "message": "Catalog search is not configured for this service. Add a track link instead."})
		return
	}
	c.JSON(http.StatusBadGateway, gin.H{"code": "provider_request_failed", "message": "The music service could not return this track. Please try again."})
}
