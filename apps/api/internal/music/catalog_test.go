package music

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCatalogSearchProviders(t *testing.T) {
	tests := []struct{ provider, body, title string }{
		{"spotify", `{"tracks":{"items":[{"id":"song","name":"Song","artists":[{"name":"Artist"}],"duration_ms":123000,"album":{"images":[{"url":"https://example.com/art.jpg","width":300,"height":300}]}}]}}`, "Song"},
		{"apple-music", `{"results":{"songs":{"data":[{"id":"123","attributes":{"name":"Apple Song","artistName":"Artist","durationInMillis":123000,"artwork":{"url":"https://example.com/{w}x{h}.jpg","width":300,"height":300},"playParams":{"id":"123"}}}]}}}`, "Apple Song"},
		{"youtube", `{"items":[{"id":{"videoId":"abcdefghijk"},"snippet":{"title":"Video Song","channelTitle":"Artist","thumbnails":{"medium":{"url":"https://example.com/art.jpg","width":320,"height":180}}}}]}`, "Video Song"},
	}
	for _, tt := range tests {
		t.Run(tt.provider, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				require.Equal(t, "hello", r.URL.Query().Get("q")+r.URL.Query().Get("term"))
				if tt.provider == "spotify" {
					require.Equal(t, "Bearer user-token", r.Header.Get("Authorization"))
				}
				if tt.provider == "apple-music" {
					require.Equal(t, "Bearer developer-token", r.Header.Get("Authorization"))
				}
				if tt.provider == "youtube" {
					require.Equal(t, "key", r.Header.Get("X-Goog-Api-Key"))
					require.Equal(t, "true", r.URL.Query().Get("videoEmbeddable"))
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(tt.body))
			}))
			defer server.Close()
			c := NewCatalog("developer-token", "us", "key")
			c.endpoint = func(string) string { return server.URL }
			results, err := c.Search(context.Background(), tt.provider, "hello", "user-token")
			require.NoError(t, err)
			require.Len(t, results, 1)
			require.Equal(t, tt.provider, results[0].TrackRef.Provider)
			require.Equal(t, tt.title, results[0].Metadata.Title)
		})
	}
}

func TestCatalogRejectsMissingConfigurationAndUnknownProviders(t *testing.T) {
	c := NewCatalog("", "us", "")
	for _, provider := range []string{"spotify", "apple-music", "youtube", "unknown"} {
		_, err := c.Search(context.Background(), provider, "hello", "")
		require.Error(t, err)
	}
	require.False(t, ValidReference("unknown", "song"))
	require.False(t, ValidReference("youtube", "../song"))
	require.True(t, ValidReference("youtube", "abcdefghijk"))
	require.True(t, ValidReference("apple-music", "123"))
}
