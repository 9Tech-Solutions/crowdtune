package auth

import (
	"errors"
	"fmt"

	"github.com/MicahParks/keyfunc/v3"
)

var ErrJWKSNotConfigured = errors.New("auth: JWKS_URL is empty - Neon Auth not provisioned yet (Phase 8a)")

func NewJWKS(jwksURL string) (keyfunc.Keyfunc, error) {
	if jwksURL == "" {
		return nil, ErrJWKSNotConfigured
	}
	k, err := keyfunc.NewDefault([]string{jwksURL})
	if err != nil {
		return nil, fmt.Errorf("init JWKS from %s: %w", jwksURL, err)
	}
	return k, nil
}
