package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/auth"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/db/sqlc"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/music"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const playbackLease = 20 * time.Second

type playbackState struct {
	LastChange     time.Time        `json:"lastChange"`
	LastPositionMs int              `json:"lastPositionMs"`
	MasterID       string           `json:"masterId"`
	Playing        bool             `json:"playing"`
	TargetPlaying  *bool            `json:"targetPlaying"`
	Reference      *music.Reference `json:"reference"`
}
type playbackRequest struct {
	Action     string           `json:"action"`
	MasterID   string           `json:"masterId"`
	Reference  *music.Reference `json:"reference"`
	PositionMs int              `json:"positionMs"`
	Playing    bool             `json:"playing"`
}
type PlaybackOps interface {
	GetPartyForUpdate(context.Context, string) (sqlc.Party, error)
	SetPartyPlayback(context.Context, sqlc.SetPartyPlaybackParams) error
	GetTopmostTrack(context.Context, string) (sqlc.QueueTrack, error)
	GetTrackForUpdate(context.Context, sqlc.GetTrackForUpdateParams) (sqlc.QueueTrack, error)
	DeleteQueueTrack(context.Context, sqlc.DeleteQueueTrackParams) error
	DeleteTrackVotes(context.Context, sqlc.DeleteTrackVotesParams) error
	UpdateQueueTrack(context.Context, sqlc.UpdateQueueTrackParams) (sqlc.QueueTrack, error)
}
type PlaybackStorer interface {
	GetParty(context.Context, string) (sqlc.Party, error)
	InPlaybackTx(context.Context, func(PlaybackOps) error) error
}
type playbackStore struct {
	pool    *pgxpool.Pool
	queries *sqlc.Queries
}

func (s *playbackStore) GetParty(ctx context.Context, id string) (sqlc.Party, error) {
	return s.queries.GetParty(ctx, id)
}
func (s *playbackStore) InPlaybackTx(ctx context.Context, fn func(PlaybackOps) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := fn(sqlc.New(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func RegisterPlayback(r *gin.RouterGroup, pool *pgxpool.Pool) {
	RegisterPlaybackWithStorer(r, &playbackStore{pool, sqlc.New(pool)})
}
func RegisterPlaybackWithStorer(r *gin.RouterGroup, store PlaybackStorer) {
	r.GET("/parties/:partyId/playback", func(c *gin.Context) {
		party, err := store.GetParty(c.Request.Context(), c.Param("partyId"))
		if err != nil {
			writePlaybackError(c, err)
			return
		}
		state := readPlayback(party)
		if state == nil || time.Since(state.LastChange) > playbackLease {
			c.JSON(http.StatusOK, nil)
			return
		}
		c.JSON(http.StatusOK, state)
	})
	r.POST("/parties/:partyId/playback", func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
		var req playbackRequest
		if c.ShouldBindJSON(&req) != nil || !validPlaybackRequest(req) {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_playback", "message": "Invalid playback command."})
			return
		}
		var result *playbackState
		err := store.InPlaybackTx(c.Request.Context(), func(ops PlaybackOps) error {
			party, err := ops.GetPartyForUpdate(c.Request.Context(), c.Param("partyId"))
			if err != nil {
				return err
			}
			if party.HostUserID != auth.UserID(c) {
				return errNotHost
			}
			if !party.IsActive {
				return errPartyEnded
			}
			state, err := applyPlayback(c.Request.Context(), ops, party, req, time.Now().UTC())
			if err != nil {
				return err
			}
			result = state
			return nil
		})
		if err != nil {
			writePlaybackError(c, err)
			return
		}
		c.JSON(http.StatusOK, result)
	})
}

var errNotHost = errors.New("not_host")
var errPartyEnded = errors.New("party_ended")
var errPlaybackConflict = errors.New("playback_conflict")
var errTrackChanged = errors.New("track_changed")

func validPlaybackRequest(r playbackRequest) bool {
	if len(r.MasterID) < 1 || len(r.MasterID) > 128 || r.PositionMs < 0 || r.PositionMs > 86400000 {
		return false
	}
	switch r.Action {
	case "claim", "state", "advance", "remove", "release":
	default:
		return false
	}
	return r.Action == "release" || (r.Reference != nil && music.ValidReference(r.Reference.Provider, r.Reference.ID))
}
func readPlayback(p sqlc.Party) *playbackState {
	var settings struct {
		Playback *playbackState `json:"playback"`
	}
	_ = json.Unmarshal(p.Settings, &settings)
	return settings.Playback
}
func applyPlayback(ctx context.Context, ops PlaybackOps, party sqlc.Party, req playbackRequest, now time.Time) (*playbackState, error) {
	previous := readPlayback(party)
	if previous != nil && previous.MasterID != req.MasterID && now.Sub(previous.LastChange) < playbackLease {
		return nil, errPlaybackConflict
	}
	if req.Action == "release" {
		if previous == nil {
			return nil, nil
		}
		previous.Playing = false
		previous.MasterID = ""
		previous.LastChange = time.Time{}
		_, err := savePlayback(ctx, ops, party.ID, previous)
		return nil, err
	}
	head, err := ops.GetTopmostTrack(ctx, party.ID)
	if err != nil {
		return nil, err
	}
	current := music.Reference{Provider: head.Provider, ID: head.ProviderTrackID}
	if req.Action != "remove" && current != *req.Reference {
		return nil, errTrackChanged
	}
	if req.Action == "state" && (previous == nil || previous.MasterID != req.MasterID || now.Sub(previous.LastChange) >= playbackLease) {
		return nil, errPlaybackConflict
	}
	if req.Action == "remove" || req.Action == "advance" {
		_, err := ops.GetTrackForUpdate(ctx, sqlc.GetTrackForUpdateParams{PartyID: party.ID, Provider: req.Reference.Provider, ProviderTrackID: req.Reference.ID})
		if err != nil {
			return nil, err
		}
		if err := ops.DeleteQueueTrack(ctx, sqlc.DeleteQueueTrackParams{PartyID: party.ID, Provider: req.Reference.Provider, ProviderTrackID: req.Reference.ID}); err != nil {
			return nil, err
		}
		if err := ops.DeleteTrackVotes(ctx, sqlc.DeleteTrackVotesParams{PartyID: party.ID, Provider: req.Reference.Provider, ProviderTrackID: req.Reference.ID}); err != nil {
			return nil, err
		}
		if current != *req.Reference {
			return previous, nil
		}
		next, err := ops.GetTopmostTrack(ctx, party.ID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		var ref *music.Reference
		if err == nil {
			_, err = ops.UpdateQueueTrack(ctx, sqlc.UpdateQueueTrackParams{PartyID: party.ID, Provider: next.Provider, ProviderTrackID: next.ProviderTrackID, OrderIdx: playingSentinel, VoteCount: next.VoteCount})
			if err != nil {
				return nil, err
			}
			ref = &music.Reference{Provider: next.Provider, ID: next.ProviderTrackID}
		}
		if ref == nil {
			_, err := savePlayback(ctx, ops, party.ID, &playbackState{})
			return nil, err
		}
		return savePlayback(ctx, ops, party.ID, &playbackState{LastChange: now, MasterID: req.MasterID, Reference: ref})
	}
	state := &playbackState{LastChange: now, LastPositionMs: req.PositionMs, MasterID: req.MasterID, Playing: req.Playing, Reference: &current}
	return savePlayback(ctx, ops, party.ID, state)
}
func savePlayback(ctx context.Context, ops PlaybackOps, id string, state *playbackState) (*playbackState, error) {
	raw, err := json.Marshal(state)
	if err != nil {
		return nil, err
	}
	err = ops.SetPartyPlayback(ctx, sqlc.SetPartyPlaybackParams{ID: id, Playback: raw})
	return state, err
}
func writePlaybackError(c *gin.Context, err error) {
	status, code, message := http.StatusInternalServerError, "internal_error", "Could not update playback."
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		status, code, message = http.StatusNotFound, "not_found", "Party or track not found."
	case errors.Is(err, errNotHost):
		status, code, message = http.StatusForbidden, "host_required", "Only the host can control playback."
	case errors.Is(err, errPartyEnded):
		status, code, message = http.StatusConflict, "party_ended", "This party has ended."
	case errors.Is(err, errPlaybackConflict):
		status, code, message = http.StatusConflict, "playback_busy", "Playback is controlled by another host tab. Stop or close that player first."
	case errors.Is(err, errTrackChanged):
		status, code, message = http.StatusConflict, "track_changed", "The current track has changed. Refresh the queue."
	}
	c.JSON(status, gin.H{"code": code, "message": message})
}
