package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/9Tech-Solutions/crowdtune/apps/api/internal/db/sqlc"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// fake store
// ---------------------------------------------------------------------------

type trackKey struct {
	partyID, provider, providerTrackID string
}

type voteKey struct {
	partyID, provider, providerTrackID, userID string
}

type fakeVotesStore struct {
	mu sync.Mutex

	parties map[string]sqlc.Party
	tracks  map[trackKey]sqlc.QueueTrack
	votes   map[voteKey]struct{}

	// error knobs
	getPartyErr  error
	applyErr     error   // returned by InTx itself, bypassing fn (persistent: applies on every call)
	intxErrQueue []error // returned by successive InTx calls, in order; nil entries pass through to fn (used to drive retry tests)
	intxCalls    int     // total InTx invocations (test introspection for retry behavior)
	updateCalled bool    // sentinel to detect UpdateQueueTrack calls
	deleteCalled bool    // sentinel to detect DeleteQueueTrack calls
}

func newFakeVotesStore() *fakeVotesStore {
	return &fakeVotesStore{
		parties: make(map[string]sqlc.Party),
		tracks:  make(map[trackKey]sqlc.QueueTrack),
		votes:   make(map[voteKey]struct{}),
	}
}

func (f *fakeVotesStore) seedParty(partyID string, createdAt time.Time) {
	f.parties[partyID] = sqlc.Party{
		ID: partyID,
		CreatedAt: pgtype.Timestamptz{
			Time:  createdAt,
			Valid: true,
		},
	}
}

func (f *fakeVotesStore) seedTrack(t sqlc.QueueTrack) {
	f.tracks[trackKey{t.PartyID, t.Provider, t.ProviderTrackID}] = t
}

func (f *fakeVotesStore) seedVote(partyID, provider, providerTrackID, userID string) {
	f.votes[voteKey{partyID, provider, providerTrackID, userID}] = struct{}{}
}

// VoteStorer outer interface
func (f *fakeVotesStore) GetParty(ctx context.Context, id string) (sqlc.Party, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.getPartyErr != nil {
		return sqlc.Party{}, f.getPartyErr
	}
	p, ok := f.parties[id]
	if !ok {
		return sqlc.Party{}, pgx.ErrNoRows
	}
	return p, nil
}

func (f *fakeVotesStore) InTx(ctx context.Context, fn func(ops VoteOps) error) error {
	f.mu.Lock()
	f.intxCalls++
	var injected error
	if len(f.intxErrQueue) > 0 {
		injected = f.intxErrQueue[0]
		f.intxErrQueue = f.intxErrQueue[1:]
	} else {
		injected = f.applyErr
	}
	f.mu.Unlock()
	if injected != nil {
		return injected
	}
	return fn(f)
}

// VoteOps transactional methods
func (f *fakeVotesStore) InsertVote(_ context.Context, arg sqlc.InsertVoteParams) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	k := voteKey{arg.PartyID, arg.Provider, arg.ProviderTrackID, arg.UserID}
	f.votes[k] = struct{}{} // ON CONFLICT DO NOTHING equivalent
	return nil
}

func (f *fakeVotesStore) DeleteVote(_ context.Context, arg sqlc.DeleteVoteParams) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.votes, voteKey{arg.PartyID, arg.Provider, arg.ProviderTrackID, arg.UserID})
	return nil
}

func (f *fakeVotesStore) CountVotesForTrack(_ context.Context, arg sqlc.CountVotesForTrackParams) (int32, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var count int32
	for k := range f.votes {
		if k.partyID == arg.PartyID && k.provider == arg.Provider && k.providerTrackID == arg.ProviderTrackID {
			count++
		}
	}
	return count, nil
}

func (f *fakeVotesStore) GetTrackForUpdate(_ context.Context, arg sqlc.GetTrackForUpdateParams) (sqlc.QueueTrack, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	k := trackKey{arg.PartyID, arg.Provider, arg.ProviderTrackID}
	t, ok := f.tracks[k]
	if !ok {
		return sqlc.QueueTrack{}, pgx.ErrNoRows
	}
	return t, nil
}

func (f *fakeVotesStore) GetTopmostTrack(_ context.Context, partyID string) (sqlc.QueueTrack, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var best *sqlc.QueueTrack
	for _, t := range f.tracks {
		if t.PartyID != partyID {
			continue
		}
		t := t
		if best == nil || t.OrderIdx < best.OrderIdx ||
			(t.OrderIdx == best.OrderIdx && t.AddedAt.Time.Before(best.AddedAt.Time)) {
			best = &t
		}
	}
	if best == nil {
		return sqlc.QueueTrack{}, pgx.ErrNoRows
	}
	return *best, nil
}

func (f *fakeVotesStore) InsertQueueTrack(_ context.Context, arg sqlc.InsertQueueTrackParams) (sqlc.QueueTrack, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	t := sqlc.QueueTrack{
		PartyID:         arg.PartyID,
		Provider:        arg.Provider,
		ProviderTrackID: arg.ProviderTrackID,
		VoteCount:       arg.VoteCount,
		OrderIdx:        arg.OrderIdx,
		IsFallback:      arg.IsFallback,
		AddedAt:         pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}
	f.tracks[trackKey{arg.PartyID, arg.Provider, arg.ProviderTrackID}] = t
	return t, nil
}

func (f *fakeVotesStore) UpdateQueueTrack(_ context.Context, arg sqlc.UpdateQueueTrackParams) (sqlc.QueueTrack, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.updateCalled = true
	k := trackKey{arg.PartyID, arg.Provider, arg.ProviderTrackID}
	t, ok := f.tracks[k]
	if !ok {
		return sqlc.QueueTrack{}, pgx.ErrNoRows
	}
	t.OrderIdx = arg.OrderIdx
	t.VoteCount = arg.VoteCount
	f.tracks[k] = t
	return t, nil
}

func (f *fakeVotesStore) DeleteQueueTrack(_ context.Context, arg sqlc.DeleteQueueTrackParams) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deleteCalled = true
	delete(f.tracks, trackKey{arg.PartyID, arg.Provider, arg.ProviderTrackID})
	return nil
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const (
	testPartyID         = "PARTY1"
	testProvider        = "spotify"
	testProviderTrackID = "track1"
	testUserID          = "user-aaa"
)

func makeTimestamp(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

func setupVoteRouter(store *fakeVotesStore) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	api := r.Group("/api")

	// Inject a fake auth user via middleware.
	api.Use(func(c *gin.Context) {
		c.Set(string("auth.user_id"), testUserID)
		c.Next()
	})

	RegisterVotesWithStorer(api, store)
	return r
}

func doPUT(r *gin.Engine, partyID, provider, trackID string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPut, "/api/parties/"+partyID+"/tracks/"+provider+"/"+trackID+"/vote", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func doDELETE(r *gin.Engine, partyID, provider, trackID string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodDelete, "/api/parties/"+partyID+"/tracks/"+provider+"/"+trackID+"/vote", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// partyCreatedAt is a fixed past time so that millisecondsSinceCreatedAt
// returns a large positive number, making order_idx very negative after
// subtracting voteFactor multiples.
var partyCreatedAt = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

// Test 1: PUT first vote on a new track in an empty queue.
// Case 2 with no playing track -> INSERT with order_idx = playingSentinel.
func TestCastVote_FirstVoteEmptyQueue(t *testing.T) {
	store := newFakeVotesStore()
	store.seedParty(testPartyID, partyCreatedAt)

	r := setupVoteRouter(store)
	w := doPUT(r, testPartyID, testProvider, testProviderTrackID)

	require.Equal(t, http.StatusOK, w.Code)
	body := w.Body.String()
	assert.Contains(t, body, `"voteCount":1`)
	assert.Contains(t, body, `"orderIdx":-9007199254740990`) // playingSentinel

	stored := store.tracks[trackKey{testPartyID, testProvider, testProviderTrackID}]
	assert.Equal(t, playingSentinel, stored.OrderIdx)
	assert.Equal(t, int32(1), stored.VoteCount)
}

// Test 2: PUT first vote on a new track when another track is already playing.
// Case 2 with playing track present -> INSERT with order_idx = ms - 1*voteFactor.
func TestCastVote_FirstVoteWithPlayingTrack(t *testing.T) {
	store := newFakeVotesStore()
	store.seedParty(testPartyID, partyCreatedAt)

	// Seed a "playing" track so GetTopmostTrack returns a row.
	store.seedTrack(sqlc.QueueTrack{
		PartyID: testPartyID, Provider: testProvider, ProviderTrackID: "playing-track",
		OrderIdx: playingSentinel, VoteCount: 2,
		AddedAt: makeTimestamp(partyCreatedAt.Add(time.Minute)),
	})

	r := setupVoteRouter(store)
	w := doPUT(r, testPartyID, testProvider, testProviderTrackID)

	require.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"voteCount":1`)

	stored := store.tracks[trackKey{testPartyID, testProvider, testProviderTrackID}]
	// order_idx = ms_since_created - 1*voteFactor
	// ms_since_created is large positive; voteFactor=1e12; result should be << 0.
	assert.Less(t, stored.OrderIdx, int64(0))
	assert.NotEqual(t, playingSentinel, stored.OrderIdx, "should not be playing sentinel")
}

// Test 3: PUT second vote on an existing non-playing track.
// Case 3, update fires. New order_idx should be more negative than old.
func TestCastVote_SecondVoteUpdatesOrderIdx(t *testing.T) {
	store := newFakeVotesStore()
	store.seedParty(testPartyID, partyCreatedAt)

	addedAt := partyCreatedAt.Add(time.Hour)
	// Seed the track with 1 existing vote from another user.
	store.seedTrack(sqlc.QueueTrack{
		PartyID: testPartyID, Provider: testProvider, ProviderTrackID: testProviderTrackID,
		VoteCount: 1, OrderIdx: millisecondsSinceCreatedAt(addedAt, makeTimestamp(partyCreatedAt)) - 1*voteFactor,
		AddedAt: makeTimestamp(addedAt),
	})
	store.seedVote(testPartyID, testProvider, testProviderTrackID, "other-user")

	r := setupVoteRouter(store)
	oldOrderIdx := store.tracks[trackKey{testPartyID, testProvider, testProviderTrackID}].OrderIdx

	w := doPUT(r, testPartyID, testProvider, testProviderTrackID)

	require.Equal(t, http.StatusOK, w.Code)
	stored := store.tracks[trackKey{testPartyID, testProvider, testProviderTrackID}]
	assert.Equal(t, int32(2), stored.VoteCount)
	assert.Less(t, stored.OrderIdx, oldOrderIdx, "more votes -> smaller (more negative) order_idx")
}

// Test 4: PUT duplicate vote from same user.
// ON CONFLICT DO NOTHING -> vote_count unchanged -> no-op branch (order_idx stays same).
// UpdateQueueTrack must NOT be called.
func TestCastVote_DuplicateVoteIsNoOp(t *testing.T) {
	store := newFakeVotesStore()
	store.seedParty(testPartyID, partyCreatedAt)

	addedAt := partyCreatedAt.Add(time.Hour)
	expectedIdx := millisecondsSinceCreatedAt(addedAt, makeTimestamp(partyCreatedAt)) - 1*voteFactor
	store.seedTrack(sqlc.QueueTrack{
		PartyID: testPartyID, Provider: testProvider, ProviderTrackID: testProviderTrackID,
		VoteCount: 1, OrderIdx: expectedIdx,
		AddedAt: makeTimestamp(addedAt),
	})
	// Same user has already voted.
	store.seedVote(testPartyID, testProvider, testProviderTrackID, testUserID)

	r := setupVoteRouter(store)
	w := doPUT(r, testPartyID, testProvider, testProviderTrackID)

	require.Equal(t, http.StatusOK, w.Code)
	// No UpdateQueueTrack call since nothing changed.
	assert.False(t, store.updateCalled, "UpdateQueueTrack must not fire on a no-op duplicate vote")
	stored := store.tracks[trackKey{testPartyID, testProvider, testProviderTrackID}]
	assert.Equal(t, int32(1), stored.VoteCount, "vote_count must stay at 1")
	assert.Equal(t, expectedIdx, stored.OrderIdx, "order_idx must be unchanged")
}

// Test 5: PUT vote on the currently-playing track.
// Case 3 isPlaying branch: vote_count frozen, order_idx stays at playingSentinel.
func TestCastVote_PlayingTrackVoteFrozen(t *testing.T) {
	store := newFakeVotesStore()
	store.seedParty(testPartyID, partyCreatedAt)

	store.seedTrack(sqlc.QueueTrack{
		PartyID: testPartyID, Provider: testProvider, ProviderTrackID: testProviderTrackID,
		VoteCount: 3, OrderIdx: playingSentinel,
		AddedAt: makeTimestamp(partyCreatedAt.Add(time.Minute)),
	})
	// Existing voter (not testUserID) to ensure count > 1 was there before.
	store.seedVote(testPartyID, testProvider, testProviderTrackID, "other-user-1")
	store.seedVote(testPartyID, testProvider, testProviderTrackID, "other-user-2")
	store.seedVote(testPartyID, testProvider, testProviderTrackID, "other-user-3")

	r := setupVoteRouter(store)
	w := doPUT(r, testPartyID, testProvider, testProviderTrackID)

	require.Equal(t, http.StatusOK, w.Code)
	// The playing track's vote_count must stay frozen (no UpdateQueueTrack).
	assert.False(t, store.updateCalled, "UpdateQueueTrack must not fire for playing track (no-op)")
	stored := store.tracks[trackKey{testPartyID, testProvider, testProviderTrackID}]
	assert.Equal(t, int32(3), stored.VoteCount, "vote_count must stay frozen at 3")
	assert.Equal(t, playingSentinel, stored.OrderIdx)
}

// Test 6: PUT vote on a fallback track.
// Case 3 (is_fallback triggers Case 3 even at vc>0). vote_count and order_idx update.
func TestCastVote_FallbackTrackUpdates(t *testing.T) {
	store := newFakeVotesStore()
	store.seedParty(testPartyID, partyCreatedAt)

	addedAt := partyCreatedAt.Add(time.Hour)
	store.seedTrack(sqlc.QueueTrack{
		PartyID: testPartyID, Provider: testProvider, ProviderTrackID: testProviderTrackID,
		VoteCount: 0, OrderIdx: 999, IsFallback: true,
		AddedAt: makeTimestamp(addedAt),
	})

	r := setupVoteRouter(store)
	w := doPUT(r, testPartyID, testProvider, testProviderTrackID)

	require.Equal(t, http.StatusOK, w.Code)
	stored := store.tracks[trackKey{testPartyID, testProvider, testProviderTrackID}]
	assert.Equal(t, int32(1), stored.VoteCount)
	// order_idx should now be ms_since_created - 1*voteFactor (highly negative).
	assert.Less(t, stored.OrderIdx, int64(0))
}

// Test 7: DELETE vote on a non-playing non-fallback track when vote_count drops to 0.
// Case 4: DELETE fires. Response 204.
func TestRetractVote_DropToZeroDeletesTrack(t *testing.T) {
	store := newFakeVotesStore()
	store.seedParty(testPartyID, partyCreatedAt)

	addedAt := partyCreatedAt.Add(time.Hour)
	store.seedTrack(sqlc.QueueTrack{
		PartyID: testPartyID, Provider: testProvider, ProviderTrackID: testProviderTrackID,
		VoteCount: 1, OrderIdx: -500,
		AddedAt: makeTimestamp(addedAt),
	})
	store.seedVote(testPartyID, testProvider, testProviderTrackID, testUserID)

	r := setupVoteRouter(store)
	w := doDELETE(r, testPartyID, testProvider, testProviderTrackID)

	require.Equal(t, http.StatusNoContent, w.Code)
	assert.True(t, store.deleteCalled, "DeleteQueueTrack must be called")
	_, trackStillExists := store.tracks[trackKey{testPartyID, testProvider, testProviderTrackID}]
	assert.False(t, trackStillExists, "track must be removed from queue")
}

// Test 8: DELETE vote on a track whose vote_count stays > 0.
// Case 3 update. Response 200.
func TestRetractVote_StaysAboveZeroUpdates(t *testing.T) {
	store := newFakeVotesStore()
	store.seedParty(testPartyID, partyCreatedAt)

	addedAt := partyCreatedAt.Add(time.Hour)
	store.seedTrack(sqlc.QueueTrack{
		PartyID: testPartyID, Provider: testProvider, ProviderTrackID: testProviderTrackID,
		VoteCount: 2, OrderIdx: -1_000_000_000_001,
		AddedAt: makeTimestamp(addedAt),
	})
	store.seedVote(testPartyID, testProvider, testProviderTrackID, testUserID)
	store.seedVote(testPartyID, testProvider, testProviderTrackID, "other-user")

	r := setupVoteRouter(store)
	w := doDELETE(r, testPartyID, testProvider, testProviderTrackID)

	require.Equal(t, http.StatusOK, w.Code)
	stored := store.tracks[trackKey{testPartyID, testProvider, testProviderTrackID}]
	assert.Equal(t, int32(1), stored.VoteCount)
}

// Test 9: DELETE vote on the currently-playing track.
// Case 3 isPlaying: vote_count stays frozen, order_idx stays at playingSentinel. Response 200.
func TestRetractVote_PlayingTrackFrozen(t *testing.T) {
	store := newFakeVotesStore()
	store.seedParty(testPartyID, partyCreatedAt)

	store.seedTrack(sqlc.QueueTrack{
		PartyID: testPartyID, Provider: testProvider, ProviderTrackID: testProviderTrackID,
		VoteCount: 2, OrderIdx: playingSentinel,
		AddedAt: makeTimestamp(partyCreatedAt.Add(time.Minute)),
	})
	store.seedVote(testPartyID, testProvider, testProviderTrackID, testUserID)
	store.seedVote(testPartyID, testProvider, testProviderTrackID, "other-user")

	r := setupVoteRouter(store)
	w := doDELETE(r, testPartyID, testProvider, testProviderTrackID)

	require.Equal(t, http.StatusOK, w.Code)
	// The playing track's vote_count must stay frozen.
	assert.False(t, store.updateCalled, "UpdateQueueTrack must not fire for playing track (no-op short-circuit)")
	stored := store.tracks[trackKey{testPartyID, testProvider, testProviderTrackID}]
	assert.Equal(t, int32(2), stored.VoteCount, "vote_count must stay frozen")
	assert.Equal(t, playingSentinel, stored.OrderIdx)
}

// Test 10: DELETE vote on a fallback track that drops to 0 votes.
// is_fallback triggers Case 3, so the track stays with vote_count=0. Response 200.
func TestRetractVote_FallbackDropToZeroStaysInQueue(t *testing.T) {
	store := newFakeVotesStore()
	store.seedParty(testPartyID, partyCreatedAt)

	addedAt := partyCreatedAt.Add(time.Hour)
	store.seedTrack(sqlc.QueueTrack{
		PartyID: testPartyID, Provider: testProvider, ProviderTrackID: testProviderTrackID,
		VoteCount: 1, OrderIdx: -500, IsFallback: true,
		AddedAt: makeTimestamp(addedAt),
	})
	store.seedVote(testPartyID, testProvider, testProviderTrackID, testUserID)

	r := setupVoteRouter(store)
	w := doDELETE(r, testPartyID, testProvider, testProviderTrackID)

	require.Equal(t, http.StatusOK, w.Code)
	assert.False(t, store.deleteCalled, "fallback track must NOT be deleted")
	stored := store.tracks[trackKey{testPartyID, testProvider, testProviderTrackID}]
	assert.Equal(t, int32(0), stored.VoteCount, "vote_count should drop to 0")
}

// Test 11: DELETE vote on a track that doesn't exist in the queue.
// Case 1: No writes. Response 204.
func TestRetractVote_TrackNotInQueueIsNoOp(t *testing.T) {
	store := newFakeVotesStore()
	store.seedParty(testPartyID, partyCreatedAt)
	// No track seeded, no vote seeded.

	r := setupVoteRouter(store)
	w := doDELETE(r, testPartyID, testProvider, testProviderTrackID)

	require.Equal(t, http.StatusNoContent, w.Code)
	assert.False(t, store.deleteCalled)
	assert.False(t, store.updateCalled)
}

// Test 12: Party not found (PUT).
func TestCastVote_PartyNotFound(t *testing.T) {
	store := newFakeVotesStore()
	// Party not seeded.

	r := setupVoteRouter(store)
	w := doPUT(r, "GHOST1", testProvider, testProviderTrackID)

	require.Equal(t, http.StatusNotFound, w.Code)
	assert.Contains(t, w.Body.String(), "party_not_found")
}

// Test 12b: Party not found (DELETE).
func TestRetractVote_PartyNotFound(t *testing.T) {
	store := newFakeVotesStore()

	r := setupVoteRouter(store)
	w := doDELETE(r, "GHOST1", testProvider, testProviderTrackID)

	require.Equal(t, http.StatusNotFound, w.Code)
	assert.Contains(t, w.Body.String(), "party_not_found")
}

// Test 13: InTx error injection -> 500 internal_error.
func TestCastVote_TxErrorReturns500(t *testing.T) {
	store := newFakeVotesStore()
	store.seedParty(testPartyID, partyCreatedAt)
	store.applyErr = errors.New("synthetic db failure")

	r := setupVoteRouter(store)
	w := doPUT(r, testPartyID, testProvider, testProviderTrackID)

	require.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Contains(t, w.Body.String(), "internal_error")
}

// Test 14: DELETE InTx error injection -> 500 internal_error.
func TestRetractVote_TxErrorReturns500(t *testing.T) {
	store := newFakeVotesStore()
	store.seedParty(testPartyID, partyCreatedAt)
	store.applyErr = errors.New("synthetic db failure")

	r := setupVoteRouter(store)
	w := doDELETE(r, testPartyID, testProvider, testProviderTrackID)

	require.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Contains(t, w.Body.String(), "internal_error")
}

// pgUniqueViolation constructs the 23505 SQLSTATE error that the partial
// unique index "one playing track per party" raises under the TOCTOU race.
func pgUniqueViolation() error {
	return &pgconn.PgError{Code: pgErrUniqueViolation}
}

// Test 15: PUT with one 23505 on the first attempt - retry succeeds.
// Verifies the handler observes the conflict, re-enters InTx, and the second
// attempt sees the (now-seeded) playing track so the new vote routes through
// Case 2 with the formula branch.
func TestCastVote_RetriesOn23505(t *testing.T) {
	store := newFakeVotesStore()
	store.seedParty(testPartyID, partyCreatedAt)
	// First InTx returns 23505 (simulating the partial-unique-index conflict);
	// second InTx falls through to fn and runs the real algorithm.
	store.intxErrQueue = []error{pgUniqueViolation()}

	r := setupVoteRouter(store)
	w := doPUT(r, testPartyID, testProvider, testProviderTrackID)

	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())
	assert.Equal(t, 2, store.intxCalls, "handler must have retried exactly once after the 23505")
}

// Test 16: PUT with 23505 on every attempt - retries exhaust, 500 returned.
// Verifies the loop is bounded and the response does not leak the SQLSTATE.
func TestCastVote_RetriesExhaustReturns500(t *testing.T) {
	store := newFakeVotesStore()
	store.seedParty(testPartyID, partyCreatedAt)
	store.intxErrQueue = []error{
		pgUniqueViolation(),
		pgUniqueViolation(),
		pgUniqueViolation(),
	}

	r := setupVoteRouter(store)
	w := doPUT(r, testPartyID, testProvider, testProviderTrackID)

	require.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Contains(t, w.Body.String(), "internal_error")
	assert.NotContains(t, w.Body.String(), "23505", "SQLSTATE must not leak in the response body")
	assert.Equal(t, maxVoteTxRetries, store.intxCalls, "handler should retry exactly maxVoteTxRetries times before giving up")
}

// Test 17: non-23505 errors (e.g. ordinary DB failures) do NOT trigger retry.
// Verifies the retry path is narrowly scoped to the unique-violation race and
// not a generic "try harder" loop for arbitrary DB hiccups.
func TestCastVote_NonRetryableErrorDoesNotRetry(t *testing.T) {
	store := newFakeVotesStore()
	store.seedParty(testPartyID, partyCreatedAt)
	store.intxErrQueue = []error{errors.New("connection reset by peer")}

	r := setupVoteRouter(store)
	w := doPUT(r, testPartyID, testProvider, testProviderTrackID)

	require.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Equal(t, 1, store.intxCalls, "non-23505 errors must not trigger a retry")
}
