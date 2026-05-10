// Package spotify provides an HTTP client for Spotify's OAuth token endpoint
// and the domain types used by the Spotify auth handlers.
package spotify

import "errors"

// tokenEndpoint is Spotify's stable OAuth 2.0 token URL.
const tokenEndpoint = "https://accounts.spotify.com/api/token"

// Sentinel errors returned by the Client methods. Callers should use
// errors.Is to check for specific conditions.
var (
	// ErrSpotifyBadRequest is returned when Spotify responds with a 4xx status.
	// Retrying will not help; the authorization code or credentials are invalid.
	ErrSpotifyBadRequest = errors.New("spotify: bad request (4xx from Spotify)")

	// ErrSpotifyUnavailable is returned when Spotify responds with 5xx on both
	// the initial attempt and the one retry.
	ErrSpotifyUnavailable = errors.New("spotify: service unavailable after retry (5xx from Spotify)")
)

// TokenResponse is the JSON body Spotify returns from its token endpoint.
// Fields match Spotify's API contract exactly.
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token"` // empty on refresh when not rotated
	Scope        string `json:"scope"`
}

// Credentials is our domain representation of a successfully exchanged
// Spotify token pair. Stored server-side; the refresh token is encrypted
// before it leaves this package boundary.
type Credentials struct {
	AccessToken  string
	ExpiresIn    int
	RefreshToken string // plaintext; caller MUST encrypt before persisting
	Scopes       string
}

// RefreshResult is the outcome of a successful refresh call.
// NewRefreshToken is non-empty only when Spotify rotates the refresh token.
type RefreshResult struct {
	AccessToken     string
	ExpiresIn       int
	NewRefreshToken string // empty when Spotify did not rotate
}

// ExchangeInput carries the parameters needed for an authorization-code grant.
type ExchangeInput struct {
	Code        string
	RedirectURI string
}
