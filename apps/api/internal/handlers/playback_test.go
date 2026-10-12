package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/db/sqlc"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/music"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type fakePlaybackStore struct{ *fakeVotesStore }

func (f *fakePlaybackStore) InPlaybackTx(ctx context.Context, fn func(PlaybackOps) error) error {
	return fn(f)
}
func (f *fakePlaybackStore) SetPartyPlayback(_ context.Context, arg sqlc.SetPartyPlaybackParams) error {
	p := f.parties[arg.ID]
	settings := map[string]json.RawMessage{}
	_ = json.Unmarshal(p.Settings, &settings)
	settings["playback"] = arg.Playback
	p.Settings, _ = json.Marshal(settings)
	f.parties[arg.ID] = p
	return nil
}
func (f *fakePlaybackStore) DeleteTrackVotes(_ context.Context, arg sqlc.DeleteTrackVotesParams) error {
	for k := range f.votes {
		if k.partyID == arg.PartyID && k.provider == arg.Provider && k.providerTrackID == arg.ProviderTrackID {
			delete(f.votes, k)
		}
	}
	return nil
}
func playbackFixture() (*fakePlaybackStore, sqlc.Party) {
	f := &fakePlaybackStore{newFakeVotesStore()}
	f.seedParty("party", time.Now())
	p := f.parties["party"]
	p.HostUserID = "host"
	p.IsActive = true
	p.Settings = []byte(`{"allowExplicitTracks":true}`)
	f.parties[p.ID] = p
	f.seedTrack(sqlc.QueueTrack{PartyID: p.ID, Provider: "youtube", ProviderTrackID: "abcdefghijk", OrderIdx: playingSentinel, VoteCount: 1})
	f.seedTrack(sqlc.QueueTrack{PartyID: p.ID, Provider: "apple-music", ProviderTrackID: "123", OrderIdx: 10, VoteCount: 2})
	return f, p
}
func TestPlaybackLeaseAndMixedProviderAdvance(t *testing.T) {
	f, p := playbackFixture()
	now := time.Now().UTC()
	ref := &music.Reference{Provider: "youtube", ID: "abcdefghijk"}
	state, err := applyPlayback(context.Background(), f, p, playbackRequest{Action: "claim", MasterID: "tab-one", Reference: ref}, now)
	require.NoError(t, err)
	require.Equal(t, "tab-one", state.MasterID)
	_, err = applyPlayback(context.Background(), f, f.parties[p.ID], playbackRequest{Action: "claim", MasterID: "tab-two", Reference: ref}, now.Add(time.Second))
	require.ErrorIs(t, err, errPlaybackConflict)
	state, err = applyPlayback(context.Background(), f, f.parties[p.ID], playbackRequest{Action: "advance", MasterID: "tab-one", Reference: ref}, now.Add(2*time.Second))
	require.NoError(t, err)
	require.Equal(t, &music.Reference{Provider: "apple-music", ID: "123"}, state.Reference)
	require.Equal(t, playingSentinel, f.tracks[trackKey{p.ID, "apple-music", "123"}].OrderIdx)
	require.Contains(t, string(f.parties[p.ID].Settings), "allowExplicitTracks")
	_, err = applyPlayback(context.Background(), f, f.parties[p.ID], playbackRequest{Action: "advance", MasterID: "tab-one", Reference: ref}, now.Add(3*time.Second))
	require.ErrorIs(t, err, errTrackChanged)
	state, err = applyPlayback(context.Background(), f, f.parties[p.ID], playbackRequest{Action: "claim", MasterID: "tab-two", Reference: state.Reference}, now.Add(playbackLease+3*time.Second))
	require.NoError(t, err)
	require.Equal(t, "tab-two", state.MasterID)
}
func TestPlaybackOnlyHostCanWriteAndRejectsInvalidBody(t *testing.T) {
	for _, tt := range []struct {
		user, body string
		status     int
	}{
		{"guest", `{"action":"claim","masterId":"tab","reference":{"provider":"youtube","id":"abcdefghijk"}}`, http.StatusForbidden},
		{"host", `{"action":"claim","masterId":"tab","positionMs":-1,"reference":{"provider":"youtube","id":"abcdefghijk"}}`, http.StatusBadRequest},
		{"host", `{"action":"claim","masterId":"tab","reference":{"provider":"unknown","id":"123"}}`, http.StatusBadRequest},
	} {
		t.Run(tt.user+tt.body, func(t *testing.T) {
			f, _ := playbackFixture()
			gin.SetMode(gin.TestMode)
			r := gin.New()
			api := r.Group("/api")
			api.Use(func(c *gin.Context) { c.Set("auth.user_id", tt.user) })
			RegisterPlaybackWithStorer(api, f)
			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/api/parties/party/playback", bytes.NewBufferString(tt.body))
			req.Header.Set("Content-Type", "application/json")
			r.ServeHTTP(w, req)
			require.Equal(t, tt.status, w.Code)
		})
	}
}

func TestPlaybackReleaseMakesLeaseImmediatelyAvailable(t *testing.T) {
	f, p := playbackFixture()
	now := time.Now().UTC()
	ref := &music.Reference{Provider: "youtube", ID: "abcdefghijk"}
	_, err := applyPlayback(context.Background(), f, p, playbackRequest{Action: "claim", MasterID: "tab-one", Reference: ref}, now)
	require.NoError(t, err)
	state, err := applyPlayback(context.Background(), f, f.parties[p.ID], playbackRequest{Action: "release", MasterID: "tab-one"}, now.Add(time.Second))
	require.NoError(t, err)
	require.Nil(t, state)
	_, err = applyPlayback(context.Background(), f, f.parties[p.ID], playbackRequest{Action: "claim", MasterID: "tab-two", Reference: ref}, now.Add(2*time.Second))
	require.NoError(t, err)
}
