package spotify

import (
	"encoding/base64"
	"net/http"
	"time"
)

// Client wraps an HTTP client pre-configured for Spotify's token endpoint.
// Construct it once at startup and share the instance across handlers.
type Client struct {
	httpClient   *http.Client
	basicAuthHdr string // "Basic <base64(clientID:clientSecret)>"
	redirectURI  string // default redirect URI; callers may override per-request
	encKey       []byte // 32-byte AES-256 key for refresh token encryption
	endpointURL  string // overrideable in tests; defaults to tokenEndpoint const
}

// sharedTransport is a package-level transport used by all Client instances
// to share idle TCP connections with Spotify's token servers.
var sharedTransport = &http.Transport{
	MaxIdleConnsPerHost: 10,
}

// NewClient constructs a Client. clientID, clientSecret, and redirectURI come
// from environment config. encKey must be exactly 32 bytes (sourced from
// tokencrypto.KeyFromHex). All values are required; callers must validate
// before calling this constructor.
func NewClient(clientID, clientSecret, redirectURI string, encKey []byte) *Client {
	return newClient(clientID, clientSecret, redirectURI, encKey, sharedTransport)
}

// NewClientWithEndpoint is like NewClient but overrides the Spotify token
// endpoint URL. Used in tests to point at an httptest.Server stub.
func NewClientWithEndpoint(clientID, clientSecret, redirectURI string, encKey []byte, endpointURL string) *Client {
	c := newClient(clientID, clientSecret, redirectURI, encKey, &http.Transport{
		MaxIdleConnsPerHost: 10,
	})
	c.endpointURL = endpointURL
	return c
}

func newClient(clientID, clientSecret, redirectURI string, encKey []byte, transport http.RoundTripper) *Client {
	raw := clientID + ":" + clientSecret
	encoded := base64.StdEncoding.EncodeToString([]byte(raw))

	return &Client{
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   30 * time.Second,
		},
		basicAuthHdr: "Basic " + encoded,
		redirectURI:  redirectURI,
		encKey:       encKey,
		endpointURL:  tokenEndpoint,
	}
}

// EncKey exposes the encryption key so handlers can call tokencrypto without
// importing it separately when they already have a *Client.
func (c *Client) EncKey() []byte { return c.encKey }
