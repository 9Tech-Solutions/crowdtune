package spotify

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ExchangeCode converts a Spotify authorization code into a Credentials value.
// It performs exactly one retry on 5xx or network errors, with a fixed 500ms
// pause before the retry. 4xx responses are not retried (the code is invalid).
//
// The plaintext refresh token is returned in Credentials.RefreshToken.
// The caller MUST encrypt it with tokencrypto before persisting.
func (c *Client) ExchangeCode(ctx context.Context, in ExchangeInput) (Credentials, error) {
	creds, err := c.doExchange(ctx, in)
	if err == nil {
		return creds, nil
	}

	// 4xx means the authorization code or credentials are bad; do not retry.
	if errors.Is(err, ErrSpotifyBadRequest) {
		return Credentials{}, err
	}

	// One retry for network errors and 5xx.
	select {
	case <-ctx.Done():
		return Credentials{}, fmt.Errorf("spotify exchange: context cancelled before retry: %w", ctx.Err())
	case <-time.After(500 * time.Millisecond):
	}

	creds, retryErr := c.doExchange(ctx, in)
	if retryErr != nil {
		return Credentials{}, fmt.Errorf("spotify exchange after retry: %w", retryErr)
	}
	return creds, nil
}

func (c *Client) doExchange(ctx context.Context, in ExchangeInput) (Credentials, error) {
	body := url.Values{
		"grant_type":   {"authorization_code"},
		"code":         {in.Code},
		"redirect_uri": {in.RedirectURI},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpointURL,
		strings.NewReader(body.Encode()))
	if err != nil {
		return Credentials{}, fmt.Errorf("spotify exchange: build request: %w", err)
	}
	req.Header.Set("Authorization", c.basicAuthHdr)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return Credentials{}, fmt.Errorf("spotify exchange: http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 && resp.StatusCode < 500 {
		return Credentials{}, ErrSpotifyBadRequest
	}
	if resp.StatusCode >= 500 {
		return Credentials{}, ErrSpotifyUnavailable
	}

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return Credentials{}, fmt.Errorf("spotify exchange: read body: %w", err)
	}

	var tr TokenResponse
	if err := json.Unmarshal(raw, &tr); err != nil {
		return Credentials{}, fmt.Errorf("spotify exchange: decode response: %w", err)
	}

	return Credentials{
		AccessToken:  tr.AccessToken,
		ExpiresIn:    tr.ExpiresIn,
		RefreshToken: tr.RefreshToken,
		Scopes:       tr.Scope,
	}, nil
}
