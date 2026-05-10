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

// RefreshAccessToken exchanges a plaintext Spotify refresh token for a new
// access token. It performs one retry on 5xx or network errors; 4xx is not
// retried (the refresh token is invalid or expired).
//
// When Spotify rotates the refresh token, RefreshResult.NewRefreshToken is
// non-empty. Callers MUST re-encrypt and persist the new value so the old
// token does not silently become invalid.
//
// This method is an internal helper; it is not exposed as a public HTTP
// endpoint in this dispatch. The plaintext refreshToken must never be logged.
func (c *Client) RefreshAccessToken(ctx context.Context, refreshToken string) (RefreshResult, error) {
	result, err := c.doRefresh(ctx, refreshToken)
	if err == nil {
		return result, nil
	}

	if errors.Is(err, ErrSpotifyBadRequest) {
		return RefreshResult{}, err
	}

	// One retry for network errors and 5xx.
	select {
	case <-ctx.Done():
		return RefreshResult{}, fmt.Errorf("spotify refresh: context cancelled before retry: %w", ctx.Err())
	case <-time.After(500 * time.Millisecond):
	}

	result, retryErr := c.doRefresh(ctx, refreshToken)
	if retryErr != nil {
		return RefreshResult{}, fmt.Errorf("spotify refresh after retry: %w", retryErr)
	}
	return result, nil
}

func (c *Client) doRefresh(ctx context.Context, refreshToken string) (RefreshResult, error) {
	body := url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpointURL,
		strings.NewReader(body.Encode()))
	if err != nil {
		return RefreshResult{}, fmt.Errorf("spotify refresh: build request: %w", err)
	}
	req.Header.Set("Authorization", c.basicAuthHdr)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return RefreshResult{}, fmt.Errorf("spotify refresh: http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 && resp.StatusCode < 500 {
		return RefreshResult{}, ErrSpotifyBadRequest
	}
	if resp.StatusCode >= 500 {
		return RefreshResult{}, ErrSpotifyUnavailable
	}

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return RefreshResult{}, fmt.Errorf("spotify refresh: read body: %w", err)
	}

	var tr TokenResponse
	if err := json.Unmarshal(raw, &tr); err != nil {
		return RefreshResult{}, fmt.Errorf("spotify refresh: decode response: %w", err)
	}

	return RefreshResult{
		AccessToken:     tr.AccessToken,
		ExpiresIn:       tr.ExpiresIn,
		NewRefreshToken: tr.RefreshToken, // empty when Spotify did not rotate
	}, nil
}
