package handlers

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/auth"
	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/db/sqlc"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

const voteFactor int64 = 1_000_000_000_000
const playingSentinel int64 = -9_007_199_254_740_990

// maxVoteTxRetries bounds the retry-on-23505 loop around the vote transaction.
// The partial unique index "one playing track per party" can fail an INSERT
// from a concurrent first-vote-on-empty-queue race; on conflict the handler
// re-runs the whole tx, which will now observe the existing playing track
// via GetTopmostTrack and route through the normal formula. 3 attempts is
// enough to converge under realistic contention; beyond that, surface 500.
const maxVoteTxRetries = 3

// errPartyNotFoundInTx is a sentinel returned from inside InTx when the party
// has been deleted between the fast-fail check and the transaction body.
var errPartyNotFoundInTx = errors.New("party_not_found_in_tx")

// VoteStorer is the outer storage interface used by the vote handler.
// GetParty is used for the pre-flight fast-fail check outside the transaction.
// InTx opens a serialized unit of work and exposes VoteOps to the callback.
type VoteStorer interface {
	GetParty(ctx context.Context, id string) (sqlc.Party, error)
	InTx(ctx context.Context, fn func(ops VoteOps) error) error
}

// VoteOps is the transactional storage interface.
// The production implementation is *sqlc.Queries wrapping a pgx.Tx.
type VoteOps interface {
	GetParty(ctx context.Context, id string) (sqlc.Party, error)
	InsertVote(ctx context.Context, arg sqlc.InsertVoteParams) error
	DeleteVote(ctx context.Context, arg sqlc.DeleteVoteParams) error
	CountVotesForTrack(ctx context.Context, arg sqlc.CountVotesForTrackParams) (int32, error)
	GetTrackForUpdate(ctx context.Context, arg sqlc.GetTrackForUpdateParams) (sqlc.QueueTrack, error)
	GetTopmostTrack(ctx context.Context, partyID string) (sqlc.QueueTrack, error)
	InsertQueueTrack(ctx context.Context, arg sqlc.InsertQueueTrackParams) (sqlc.QueueTrack, error)
	UpdateQueueTrack(ctx context.Context, arg sqlc.UpdateQueueTrackParams) (sqlc.QueueTrack, error)
	DeleteQueueTrack(ctx context.Context, arg sqlc.DeleteQueueTrackParams) error
}

// Compile-time assertion: *sqlc.Queries satisfies VoteOps.
var _ VoteOps = (*sqlc.Queries)(nil)

// productionVotesStore wraps the pool and a non-tx Queries for the fast-fail
// GetParty call, and opens real Postgres transactions for InTx.
type productionVotesStore struct {
	pool    *pgxpool.Pool
	queries *sqlc.Queries
}

func (s *productionVotesStore) GetParty(ctx context.Context, id string) (sqlc.Party, error) {
	return s.queries.GetParty(ctx, id)
}

func (s *productionVotesStore) InTx(ctx context.Context, fn func(ops VoteOps) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback on fn error or panic; harmless if already committed

	qtx := sqlc.New(tx)
	if err := fn(qtx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	return nil
}

type votesHandler struct {
	store VoteStorer
}

// RegisterVotes mounts the vote routes on the given group using the pool.
func RegisterVotes(r *gin.RouterGroup, pool *pgxpool.Pool) {
	RegisterVotesWithStorer(r, &productionVotesStore{pool: pool, queries: sqlc.New(pool)})
}

// RegisterVotesWithStorer is the testable variant that accepts an injected storer.
func RegisterVotesWithStorer(r *gin.RouterGroup, store VoteStorer) {
	h := &votesHandler{store: store}
	r.PUT("/parties/:partyId/tracks/:provider/:trackId/vote", h.castVote)
	r.DELETE("/parties/:partyId/tracks/:provider/:trackId/vote", h.retractVote)
}

func (h *votesHandler) castVote(c *gin.Context)    { h.applyVote(c, +1) }
func (h *votesHandler) retractVote(c *gin.Context) { h.applyVote(c, -1) }

// voteOutcome carries the result from inside the transaction to the response writer.
type voteOutcome struct {
	track  *sqlc.QueueTrack // non-nil on 200; nil on 204
	isNoOp bool             // true when the operation was a no-op (204)
}

func (h *votesHandler) applyVote(c *gin.Context, delta int) {
	ctx := c.Request.Context()
	userID := auth.UserID(c)
	partyID := c.Param("partyId")
	provider := c.Param("provider")
	providerTrackID := c.Param("trackId")

	// Fast-fail: check party existence outside the transaction to avoid an
	// unnecessary transaction round-trip on a stale/wrong party ID.
	// The authoritative check is repeated inside InTx.
	if _, err := h.store.GetParty(ctx, partyID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			slog.Info("apply_vote", "user_id", userID, "party_id", partyID,
				"provider", provider, "track_id", providerTrackID,
				"delta", delta, "outcome", "not_found")
			c.JSON(http.StatusNotFound, gin.H{
				"code":    "party_not_found",
				"message": "party not found",
			})
			return
		}
		slog.Info("apply_vote", "user_id", userID, "party_id", partyID,
			"provider", provider, "track_id", providerTrackID,
			"delta", delta, "outcome", "db_error")
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    "internal_error",
			"message": "failed to retrieve party; please try again",
		})
		return
	}

	// Retry the whole transaction on 23505 from the partial unique index
	// guarding "one playing track per party". A concurrent first-vote
	// transaction may have inserted a playing-sentinel row between our
	// GetTopmostTrack read and our INSERT; the retry sees the now-existing
	// playing track and routes the new vote through the formula branch.
	var outcome voteOutcome
	var txErr error
	for attempt := 0; attempt < maxVoteTxRetries; attempt++ {
		outcome, txErr = h.attemptVote(ctx, partyID, provider, providerTrackID, userID, delta)
		if txErr == nil || !isUniqueViolation(txErr) {
			break
		}
	}

	if txErr != nil {
		if errors.Is(txErr, errPartyNotFoundInTx) {
			slog.Info("apply_vote", "user_id", userID, "party_id", partyID,
				"provider", provider, "track_id", providerTrackID,
				"delta", delta, "outcome", "not_found")
			c.JSON(http.StatusNotFound, gin.H{
				"code":    "party_not_found",
				"message": "party not found",
			})
			return
		}
		slog.Info("apply_vote", "user_id", userID, "party_id", partyID,
			"provider", provider, "track_id", providerTrackID,
			"delta", delta, "outcome", "db_error")
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    "internal_error",
			"message": "failed to apply vote; please try again",
		})
		return
	}

	if outcome.isNoOp || outcome.track == nil {
		slog.Info("apply_vote", "user_id", userID, "party_id", partyID,
			"provider", provider, "track_id", providerTrackID,
			"delta", delta, "outcome", "no_op")
		c.Status(http.StatusNoContent)
		return
	}

	slog.Info("apply_vote", "user_id", userID, "party_id", partyID,
		"provider", provider, "track_id", providerTrackID,
		"delta", delta, "outcome", "ok",
		"vote_count", outcome.track.VoteCount,
		"order_idx", outcome.track.OrderIdx)
	c.JSON(http.StatusOK, toQueueTrackResponse(*outcome.track))
}

// attemptVote runs one transaction worth of the vote algorithm. Returns the
// outcome on success or a zero-value outcome plus the transaction error on
// failure. Idempotent in isolation; the caller retries on isUniqueViolation
// from the "one playing track per party" partial unique index.
func (h *votesHandler) attemptVote(
	ctx context.Context,
	partyID, provider, providerTrackID, userID string,
	delta int,
) (voteOutcome, error) {
	var outcome voteOutcome
	err := h.store.InTx(ctx, func(ops VoteOps) error {
		// Authoritative party check inside the transaction.
		party, err := ops.GetParty(ctx, partyID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return errPartyNotFoundInTx
			}
			return fmt.Errorf("get party in tx: %w", err)
		}

		// Mutate user_votes (idempotent).
		if delta > 0 {
			if err := ops.InsertVote(ctx, sqlc.InsertVoteParams{
				PartyID:         partyID,
				Provider:        provider,
				ProviderTrackID: providerTrackID,
				UserID:          userID,
			}); err != nil {
				return fmt.Errorf("insert vote: %w", err)
			}
		} else {
			if err := ops.DeleteVote(ctx, sqlc.DeleteVoteParams{
				PartyID:         partyID,
				Provider:        provider,
				ProviderTrackID: providerTrackID,
				UserID:          userID,
			}); err != nil {
				return fmt.Errorf("delete vote: %w", err)
			}
		}

		// Recompute authoritative vote_count.
		vc, err := ops.CountVotesForTrack(ctx, sqlc.CountVotesForTrackParams{
			PartyID:         partyID,
			Provider:        provider,
			ProviderTrackID: providerTrackID,
		})
		if err != nil {
			return fmt.Errorf("count votes: %w", err)
		}
		vcInt64 := int64(vc)

		// Lock the queue_tracks row (if it exists).
		row, err := ops.GetTrackForUpdate(ctx, sqlc.GetTrackForUpdateParams{
			PartyID:         partyID,
			Provider:        provider,
			ProviderTrackID: providerTrackID,
		})
		rowExists := true
		if err != nil {
			if !errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("get track for update: %w", err)
			}
			rowExists = false
		}

		// Find topmost track (for Case 2 when queue is empty).
		_, err = ops.GetTopmostTrack(ctx, partyID)
		topExists := true
		if err != nil {
			if !errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("get topmost track: %w", err)
			}
			topExists = false
		}

		switch {
		case !rowExists && vcInt64 <= 0:
			// Case 1: track absent, no votes - no-op.
			outcome = voteOutcome{isNoOp: true}

		case !rowExists && vcInt64 > 0:
			// Case 2: track absent but has votes - INSERT.
			var newOrderIdx int64
			if !topExists {
				newOrderIdx = playingSentinel
			} else {
				newOrderIdx = millisecondsSinceCreatedAt(time.Now(), party.CreatedAt) - vcInt64*voteFactor
			}
			inserted, err := ops.InsertQueueTrack(ctx, sqlc.InsertQueueTrackParams{
				PartyID:         partyID,
				Provider:        provider,
				ProviderTrackID: providerTrackID,
				VoteCount:       int32(vcInt64),
				OrderIdx:        newOrderIdx,
				IsFallback:      false,
			})
			if err != nil {
				return fmt.Errorf("insert queue track: %w", err)
			}
			outcome = voteOutcome{track: &inserted}

		case rowExists && (vcInt64 > 0 || row.OrderIdx == playingSentinel || row.IsFallback):
			// Case 3: track exists and should stay in queue.
			isPlaying := row.OrderIdx == playingSentinel
			var newOrderIdx int64
			var voteCountToWrite int32
			if isPlaying {
				newOrderIdx = playingSentinel
				voteCountToWrite = row.VoteCount // frozen
			} else {
				newOrderIdx = millisecondsSinceCreatedAt(row.AddedAt.Time, party.CreatedAt) - vcInt64*voteFactor
				voteCountToWrite = int32(vcInt64)
			}
			// No-op short-circuit: avoid a write if nothing changed.
			if newOrderIdx == row.OrderIdx && voteCountToWrite == row.VoteCount {
				outcome = voteOutcome{track: &row}
			} else {
				updated, err := ops.UpdateQueueTrack(ctx, sqlc.UpdateQueueTrackParams{
					PartyID:         partyID,
					Provider:        provider,
					ProviderTrackID: providerTrackID,
					OrderIdx:        newOrderIdx,
					VoteCount:       voteCountToWrite,
				})
				if err != nil {
					return fmt.Errorf("update queue track: %w", err)
				}
				outcome = voteOutcome{track: &updated}
			}

		default:
			// Case 4: track exists, vote_count <= 0, not playing, not fallback - DELETE.
			if err := ops.DeleteQueueTrack(ctx, sqlc.DeleteQueueTrackParams{
				PartyID:         partyID,
				Provider:        provider,
				ProviderTrackID: providerTrackID,
			}); err != nil {
				return fmt.Errorf("delete queue track: %w", err)
			}
			outcome = voteOutcome{isNoOp: true}
		}
		return nil
	})
	if err != nil {
		return voteOutcome{}, err
	}
	return outcome, nil
}

// toQueueTrackResponse converts a single sqlc.QueueTrack to the JSON response shape.
func toQueueTrackResponse(r sqlc.QueueTrack) queueTrackResponse {
	return queueTrackResponse{
		Reference: trackReference{
			Provider: r.Provider,
			ID:       r.ProviderTrackID,
		},
		VoteCount:  r.VoteCount,
		OrderIdx:   r.OrderIdx,
		IsFallback: r.IsFallback,
		AddedAt:    r.AddedAt.Time.UTC().Format(time.RFC3339),
	}
}

// millisecondsSinceCreatedAt returns how many milliseconds elapsed between
// partyCreatedAt and t. Used to place a track in the sorted queue.
func millisecondsSinceCreatedAt(t time.Time, partyCreatedAt pgtype.Timestamptz) int64 {
	return t.Sub(partyCreatedAt.Time).Milliseconds()
}
