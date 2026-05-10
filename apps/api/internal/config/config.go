package config

import (
	"fmt"

	"github.com/caarlos0/env/v11"
	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL string `env:"DATABASE_URL,required"`
	Host        string `env:"API_HOST" envDefault:"0.0.0.0"`
	Port        string `env:"API_PORT" envDefault:"8080"`
	Env         string `env:"API_ENV" envDefault:"local"`
	LogLevel    string `env:"LOG_LEVEL" envDefault:"info"`

	// Neon Auth (Phase 8). Optional until provisioning is complete.
	JWKSURL  string `env:"NEON_AUTH_JWKS_URL"`
	Issuer   string `env:"NEON_AUTH_ISSUER"`
	Audience string `env:"NEON_AUTH_AUDIENCE" envDefault:"crowdtune"`

	// Spotify OAuth (Phase 9). All optional; if any is unset, the Spotify
	// endpoints are disabled and spotify_enabled=false is logged at startup.
	SpotifyClientID     string `env:"SPOTIFY_CLIENT_ID"`
	SpotifyClientSecret string `env:"SPOTIFY_CLIENT_SECRET"`
	SpotifyTokenEncKey  string `env:"SPOTIFY_TOKEN_ENC_KEY"`
	SpotifyRedirectURI  string `env:"SPOTIFY_REDIRECT_URI"`
}

func Load() (*Config, error) {
	_ = godotenv.Load("../../.env", ".env")

	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, fmt.Errorf("parse env: %w", err)
	}
	return cfg, nil
}
