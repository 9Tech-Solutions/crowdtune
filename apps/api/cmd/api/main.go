package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/auth"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/config"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/handlers"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/spotify"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/tokencrypto"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("config load failed", "err", err)
		os.Exit(1)
	}

	rootCtx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	pool, err := pgxpool.New(rootCtx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("pgxpool init failed", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	if cfg.Env != "local" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(requestLogger(logger))

	// Public endpoints.
	handlers.RegisterMeta(router, pool)

	// Protected endpoints. JWKS is optional during Phase 8a; if unset, the
	// /api group is skipped and any client call to /api/* gets a clean 404.
	jwks, err := auth.NewJWKS(cfg.JWKSURL)
	switch {
	case errors.Is(err, auth.ErrJWKSNotConfigured):
		logger.Warn("Neon Auth JWKS_URL not set; protected /api/* endpoints disabled until Phase 8a")
	case err != nil:
		logger.Error("JWKS init failed", "err", err)
		os.Exit(1)
	default:
		api := router.Group("/api")
		handlers.RegisterMe(api, jwks, cfg.Issuer, cfg.Audience)
		// Do not log issuer / audience values: the issuer URL is single-tenant and
		// identifies the Neon project. Booleans are sufficient for ops.
		logger.Info("auth middleware live",
			"issuer_set", cfg.Issuer != "",
			"audience_set", cfg.Audience != "",
		)

		// Parties (Phase 10b.2). Always-on; no env-var gating.
		handlers.RegisterParties(api, pool)

		// Queue listing (Phase 10b.2.B). Always-on; no env-var gating.
		handlers.RegisterQueue(api, pool)

		// Spotify OAuth (Phase 9). All four env vars must be non-empty.
		// Log set/unset booleans; never log the values themselves.
		logger.Info("spotify config",
			"spotify_client_id_set", cfg.SpotifyClientID != "",
			"spotify_client_secret_set", cfg.SpotifyClientSecret != "",
			"spotify_enc_key_set", cfg.SpotifyTokenEncKey != "",
			"spotify_redirect_uri_set", cfg.SpotifyRedirectURI != "",
		)
		if cfg.SpotifyClientID != "" && cfg.SpotifyClientSecret != "" &&
			cfg.SpotifyTokenEncKey != "" && cfg.SpotifyRedirectURI != "" {
			encKey, err := tokencrypto.KeyFromHex(cfg.SpotifyTokenEncKey)
			if err != nil {
				logger.Error("spotify enc key invalid", "err", err)
				logger.Info("spotify_enabled", "value", false)
			} else {
				spotifyClient := spotify.NewClient(
					cfg.SpotifyClientID,
					cfg.SpotifyClientSecret,
					cfg.SpotifyRedirectURI,
					encKey,
				)
				handlers.RegisterSpotify(api, spotifyClient, pool)
				logger.Info("spotify_enabled", "value", true)
			}
		} else {
			logger.Info("spotify_enabled", "value", false)
		}
	}

	srv := &http.Server{
		Addr:              fmt.Sprintf("%s:%s", cfg.Host, cfg.Port),
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info("api listening", "addr", srv.Addr, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server crashed", "err", err)
			cancel()
		}
	}()

	<-rootCtx.Done()
	logger.Info("shutdown signal received")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", "err", err)
		os.Exit(1)
	}
	logger.Info("shutdown clean")
}

func requestLogger(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		logger.Info(
			"request",
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", c.Writer.Status(),
			"dur_ms", time.Since(start).Milliseconds(),
		)
	}
}
