package music

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

var ErrNotConfigured = errors.New("music provider is not configured")
var referenceID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

func ValidProvider(provider string) bool {
	return provider == "spotify" || provider == "youtube" || provider == "apple-music"
}
func ValidReference(provider, id string) bool {
	return ValidProvider(provider) && referenceID.MatchString(id)
}

type Reference struct {
	Provider string `json:"provider"`
	ID       string `json:"id"`
}
type Image struct {
	URL    string `json:"url"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}
type Metadata struct {
	Title       string   `json:"title"`
	Artists     []string `json:"artists"`
	CoverImages []Image  `json:"coverImages"`
	DurationMs  int      `json:"durationMs"`
	IsPlayable  bool     `json:"isPlayable"`
}
type Result struct {
	TrackRef Reference `json:"trackRef"`
	Metadata *Metadata `json:"metadata"`
}

type Catalog struct {
	client                             *http.Client
	appleToken, storefront, youtubeKey string
	endpoint                           func(string) string
}

func NewCatalog(appleToken, storefront, youtubeKey string) *Catalog {
	if storefront == "" {
		storefront = "us"
	}
	return &Catalog{client: &http.Client{Timeout: 15 * time.Second}, appleToken: appleToken, storefront: storefront, youtubeKey: youtubeKey, endpoint: func(provider string) string {
		switch provider {
		case "spotify":
			return "https://api.spotify.com/v1"
		case "apple-music":
			return "https://api.music.apple.com/v1/catalog"
		default:
			return "https://www.googleapis.com/youtube/v3"
		}
	}}
}

func (c *Catalog) request(ctx context.Context, provider, path, token string, query url.Values, out any) error {
	switch provider {
	case "spotify":
		if token == "" {
			return ErrNotConfigured
		}
	case "apple-music":
		token = c.appleToken
		if token == "" {
			return ErrNotConfigured
		}
	case "youtube":
		if c.youtubeKey == "" {
			return ErrNotConfigured
		}
	default:
		return fmt.Errorf("unsupported music provider")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint(provider)+path+"?"+query.Encode(), nil)
	if err != nil {
		return err
	}
	if provider == "youtube" {
		req.Header.Set("X-Goog-Api-Key", c.youtubeKey)
	} else {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	response, err := c.client.Do(req)
	if err != nil {
		return errors.New("music provider request failed")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("music provider returned status %d", response.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(out)
}

type spotifyTrack struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Duration   int    `json:"duration_ms"`
	IsPlayable *bool  `json:"is_playable"`
	Artists    []struct {
		Name string `json:"name"`
	} `json:"artists"`
	Album struct {
		Images []Image `json:"images"`
	} `json:"album"`
}

func (t spotifyTrack) result() Result {
	artists := make([]string, 0, len(t.Artists))
	for _, a := range t.Artists {
		artists = append(artists, a.Name)
	}
	images := t.Album.Images
	if images == nil {
		images = []Image{}
	}
	return Result{Reference{"spotify", t.ID}, &Metadata{t.Name, artists, images, t.Duration, t.IsPlayable == nil || *t.IsPlayable}}
}

type appleTrack struct {
	ID         string `json:"id"`
	Attributes struct {
		Name       string `json:"name"`
		Artist     string `json:"artistName"`
		Duration   int    `json:"durationInMillis"`
		Artwork    Image  `json:"artwork"`
		PlayParams *struct {
			ID string `json:"id"`
		} `json:"playParams"`
	} `json:"attributes"`
}

func (t appleTrack) result() Result {
	art := t.Attributes.Artwork
	art.URL = strings.NewReplacer("{w}", "300", "{h}", "300").Replace(art.URL)
	images := []Image{}
	if art.URL != "" {
		images = append(images, art)
	}
	return Result{Reference{"apple-music", t.ID}, &Metadata{t.Attributes.Name, []string{t.Attributes.Artist}, images, t.Attributes.Duration, t.Attributes.PlayParams != nil}}
}

type youtubeSnippet struct {
	Title      string `json:"title"`
	Channel    string `json:"channelTitle"`
	Thumbnails struct {
		Medium Image `json:"medium"`
	} `json:"thumbnails"`
}

func youtubeResult(id string, s youtubeSnippet) Result {
	images := []Image{}
	if s.Thumbnails.Medium.URL != "" {
		images = append(images, s.Thumbnails.Medium)
	}
	return Result{Reference{"youtube", id}, &Metadata{s.Title, []string{s.Channel}, images, 0, true}}
}

func (c *Catalog) Search(ctx context.Context, provider, term, spotifyToken string) ([]Result, error) {
	results := []Result{}
	switch provider {
	case "spotify":
		var body struct {
			Tracks struct {
				Items []spotifyTrack `json:"items"`
			} `json:"tracks"`
		}
		err := c.request(ctx, provider, "/search", spotifyToken, url.Values{"q": {term}, "type": {"track"}, "limit": {"10"}}, &body)
		if err != nil {
			return nil, err
		}
		for _, t := range body.Tracks.Items {
			results = append(results, t.result())
		}
	case "apple-music":
		var body struct {
			Results struct {
				Songs struct {
					Data []appleTrack `json:"data"`
				} `json:"songs"`
			} `json:"results"`
		}
		err := c.request(ctx, provider, "/"+url.PathEscape(c.storefront)+"/search", "", url.Values{"term": {term}, "types": {"songs"}, "limit": {"20"}}, &body)
		if err != nil {
			return nil, err
		}
		for _, t := range body.Results.Songs.Data {
			results = append(results, t.result())
		}
	case "youtube":
		var body struct {
			Items []struct {
				ID struct {
					VideoID string `json:"videoId"`
				} `json:"id"`
				Snippet youtubeSnippet `json:"snippet"`
			} `json:"items"`
		}
		err := c.request(ctx, provider, "/search", "", url.Values{"q": {term}, "part": {"snippet"}, "type": {"video"}, "videoEmbeddable": {"true"}, "videoSyndicated": {"true"}, "maxResults": {"20"}}, &body)
		if err != nil {
			return nil, err
		}
		for _, t := range body.Items {
			results = append(results, youtubeResult(t.ID.VideoID, t.Snippet))
		}
	default:
		return nil, fmt.Errorf("unsupported music provider")
	}
	return results, nil
}

func (c *Catalog) Track(ctx context.Context, ref Reference, spotifyToken string) (*Metadata, error) {
	if !ValidReference(ref.Provider, ref.ID) {
		return nil, fmt.Errorf("invalid track reference")
	}
	switch ref.Provider {
	case "spotify":
		var t spotifyTrack
		err := c.request(ctx, ref.Provider, "/tracks/"+url.PathEscape(ref.ID), spotifyToken, url.Values{}, &t)
		if err != nil {
			return nil, err
		}
		return t.result().Metadata, nil
	case "apple-music":
		var body struct {
			Data []appleTrack `json:"data"`
		}
		err := c.request(ctx, ref.Provider, "/"+url.PathEscape(c.storefront)+"/songs/"+url.PathEscape(ref.ID), "", url.Values{}, &body)
		if err != nil {
			return nil, err
		}
		if len(body.Data) == 0 {
			return nil, fmt.Errorf("track not found")
		}
		return body.Data[0].result().Metadata, nil
	default:
		var body struct {
			Items []struct {
				ID      string         `json:"id"`
				Snippet youtubeSnippet `json:"snippet"`
				Details struct {
					Duration string `json:"duration"`
				} `json:"contentDetails"`
				Status struct {
					Embeddable bool `json:"embeddable"`
				} `json:"status"`
			} `json:"items"`
		}
		err := c.request(ctx, ref.Provider, "/videos", "", url.Values{"id": {ref.ID}, "part": {"snippet,contentDetails,status"}}, &body)
		if err != nil {
			return nil, err
		}
		if len(body.Items) == 0 {
			return nil, fmt.Errorf("track not found")
		}
		t := body.Items[0]
		m := youtubeResult(t.ID, t.Snippet).Metadata
		m.IsPlayable = t.Status.Embeddable
		// YouTube returns ISO 8601 duration; videos used here have whole-second durations.
		parts := regexp.MustCompile(`^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$`).FindStringSubmatch(t.Details.Duration)
		if parts != nil {
			for i, factor := range []int{3600000, 60000, 1000} {
				var n int
				fmt.Sscanf(parts[i+1], "%d", &n)
				m.DurationMs += n * factor
			}
		}
		return m, nil
	}
}
