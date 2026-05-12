# Spec: vote-processor

## 1. Purpose

The vote processor is a server-side background module that reacts to every vote event on a party's track queue and recomputes each affected track's sort position in real time. Its role is to maintain a deterministic, globally-consistent queue ordering so that every participant in a party sees the same ranked list and the playback engine always knows which track to play next. It sits at the data plane boundary between user voting actions (cast or retracted) and the ordered queue that drives playback selection. It is not a client-facing endpoint; it is a triggered computation unit that runs whenever a vote record is written or deleted.

---

## 2. Inputs and Outputs

### Data the processor reads

**Vote event** - a write notification that carries:
- `partyId`: the opaque string identifier of the party whose queue is affected. Required. Must be non-empty.
- `trackId`: the opaque string identifier of the track that received the vote. Required. Encodes both a streaming provider name and a provider-native track ID in a single compound string (format: `provider:id`).
- `userId`: the opaque string identifier of the user who cast or retracted the vote. Used only to identify the specific vote record; the processor does not use this value beyond routing.
- `voteDelta`: derived from whether the vote record now exists or was deleted. A vote creation yields `+1`; a vote deletion yields `-1`. This is never read from the incoming payload directly - it is computed from the before/after state of the vote record.

**Party record** (fetched from storage, may be served from an in-process LRU cache):
- `created_at`: a millisecond-precision Unix timestamp recording when the party was first created. Required. Must be a positive integer. The processor treats this as immutable once set.

**Current topmost track** (fetched from storage at event time):
- The single track record that currently has the lowest `order` value in the party's queue. The processor uses this to determine whether the track being updated is the currently-playing track.
- Relevant fields: `reference` - a structured object containing `provider` (a string naming the streaming service) and `id` (the provider-native track ID).

**Track record** (read inside a transaction for the track being updated):
- `vote_count`: integer, current number of net upvotes. May be absent if the track does not yet exist in the queue.
- `added_at`: millisecond-precision Unix timestamp assigned by the server at the moment the track was inserted into the queue. Used for tie-breaking in ranking.
- `order`: numeric sort key. Lower values appear earlier in the queue.
- `reference`: structured object with `provider` and `id`. Used to check whether this track is the currently-playing one.
- `is_fallback`: boolean flag. When true, the track is a fallback/filler track that should not be evicted from the queue even when its vote count drops to zero.

### Data the processor writes

**Track record update** - for the single track identified by `trackId` within the named party's queue:
- `order`: recomputed numeric sort key (see Algorithm section).
- `vote_count`: updated integer reflecting the new net vote count. Not updated if the track is currently playing.
- `added_at`: server-assigned timestamp at write time. Only set when a brand-new track record is being created.
- `reference`: structured object with `provider` and `id`. Only set when a brand-new track record is being created.
- `is_fallback`: set to `false` when a brand-new track record is being created.

When the algorithm determines a track should be removed from the queue, it deletes the track record entirely rather than updating individual fields.

---

## 3. Algorithm

### Ranking formula

The queue is ordered by a single numeric `order` field. Ascending order means the track with the smallest value appears first. The currently-playing track must always appear first.

For any non-playing track, the sort key is computed as:

  `order = (time_since_party_creation_ms) - (vote_count * VOTE_FACTOR)`

where `time_since_party_creation_ms` is the track's `added_at` timestamp minus the party's `created_at` timestamp (both in milliseconds), and `VOTE_FACTOR` is a large constant (ten to the power of twelve, i.e. 1,000,000,000,000) chosen to ensure that any difference in vote count dominates any difference in insertion time. In other words, a track with one more vote will always rank ahead of a track with one fewer vote, regardless of how much earlier or later it was added to the queue.

The currently-playing track is assigned the value `Number.MIN_SAFE_INTEGER + 1` (the most negative safe integer plus one) so it always sorts before all other tracks.

The formula produces negative values for highly-voted tracks and large positive values for zero-vote tracks added late in a long party, which matches the ascending-order requirement.

### State transitions

The processor evaluates four mutually exclusive cases for the track identified by `trackId`:

**Case 1 - Vote retracted on a removed track:** The track record does not exist in storage (it was already deleted) and the computed new vote count would be negative or zero. This happens when a user retracts a vote on a track that was subsequently removed from the queue. The processor makes no change - it leaves storage exactly as it found it.

**Case 2 - New track voted into existence:** The track record does not exist in storage and the computed new vote count is positive (someone upvoted a track that was not yet in the queue). The processor creates a new track record with:
- `added_at` set to the server-assigned timestamp at write time.
- `is_fallback` set to false.
- `reference` set by parsing the compound `trackId` string into its `provider` and `id` components.
- `vote_count` set to the computed new vote count (which is 1, since the track is new and `voteDelta` is +1).
- `order` set to `Number.MIN_SAFE_INTEGER + 1` if there is currently no playing track (the new track immediately becomes the first-in-queue), otherwise computed with the ranking formula using `Date.now()` as a proxy for `added_at` (since no stored `added_at` exists yet at this moment).

**Case 3 - Existing track updated:** The track record exists and at least one of the following is true: the new vote count is positive, the track is currently playing, or the track is a fallback track. This is the common path. The processor recomputes `order` using the stored `added_at` value (not `Date.now()`). If the computed new `order` equals the existing `order` (using loose equality, meaning the values compare equal even across number and string representations), the processor makes no write - it signals to the storage layer that nothing changed. Otherwise it updates `order` in place. `vote_count` is also updated to the new value, except when the track is currently playing - in that case `vote_count` is left unchanged.

**Case 4 - Track exhausted:** The track record exists, the new vote count is not positive, the track is not currently playing, and the track is not a fallback. The processor deletes the track record entirely by returning a null value to the transaction.

### Concurrency control

The `order` update is wrapped in a storage transaction. The transaction receives the current state of the track record, computes the new state, and returns it atomically. If the record was modified by another concurrent operation between when the processor read the "topmost track" and when it writes, the transaction layer will automatically retry with the freshest value. All logic inside the transaction is therefore pure and side-effect-free.

### Party creation date caching

Because the party's `created_at` is required for every vote event and is immutable once set, the processor maintains an in-process LRU cache keyed by `partyId` bounded at 1000 entries. On a cache hit the storage read is skipped. On a miss the party record is fetched from storage, the `created_at` value is stored in the cache, and future invocations for the same party reuse it. The cache is process-local and does not survive function restarts, but this is acceptable because the party record is always the authoritative source and the cache is only a latency optimization.

If the party does not exist in storage, or if the party record is missing a valid `created_at` value, the processor throws an error and aborts processing for that vote event.

---

## 4. Triggers and Side Effects

### Trigger

The processor is triggered by any write (creation, update, or deletion) to a vote record identified by the path pattern `votes / {partyId} / {trackId} / {userId}`. This includes:
- A user casting a vote for the first time on a track (record created).
- A user retracting a previously cast vote (record deleted).

The trigger fires once per write. It does not poll; it is event-driven.

### Side effects

1. **Party record read** - at most one storage read per unique `partyId` per process lifetime (subsequent reads hit the cache). This read is non-destructive.
2. **Topmost track read** - one storage read per trigger invocation, fetching the single track with the lowest `order` value in the party's queue. This read is non-destructive.
3. **Track record transaction** - one atomic read-modify-write (or read-delete) on the specific track record. This is the only write the processor performs. The transaction may be retried by the storage layer if concurrent writes are detected.
4. **Error logging** - if the transaction throws, the processor logs the path of the offending vote record (including `partyId`, `trackId`, and `userId`) and re-throws the error.

### Idempotency

The processor is not strictly idempotent if the same vote event is replayed, because vote counts are incremented or decremented as a side effect. However, the transaction-based write prevents double-application of the same delta within a single atomic operation. Duplicate event delivery (if the trigger infrastructure retries a failed invocation) could result in a vote count being applied twice. This is a property of the eventual-consistency trigger model, not of the algorithm itself.

---

## 5. Edge Cases and Invariants

**Zero-vote queue:** If a party has no tracks with votes, only fallback tracks (or no tracks at all) are present. The processor handles this gracefully - new tracks voted into an empty queue receive the minimum sort key and become the first track immediately.

**Single track in queue:** If only one track exists and its vote is retracted, and it is not a fallback and not currently playing, Case 4 applies and the queue becomes empty.

**All votes retracted on a non-playing, non-fallback track:** The track is deleted from the queue. The queue shrinks by one.

**Vote retracted on currently-playing track:** Case 3 applies (the track is currently playing). The track stays in the queue and its `order` is recomputed to `Number.MIN_SAFE_INTEGER + 1`. The `vote_count` field is NOT updated when the track is currently playing - the playing track's vote count is intentionally frozen.

**Vote retracted on a fallback track:** Case 3 applies (`is_fallback` is true). The track stays in the queue and its `order` and `vote_count` are updated normally.

**Track voted into queue when no current track exists:** The new track is given the minimum sort key (`Number.MIN_SAFE_INTEGER + 1`) and immediately becomes the "first" track. This handles the case where a party is starting and the queue is otherwise empty.

**Tie-breaking by insertion time:** Two tracks with the same vote count are ordered by their `added_at` timestamp (earlier addition = lower `order` value = appears first in queue). The VOTE_FACTOR constant ensures vote count always dominates insertion time: even a single vote difference will produce a larger `order` delta than any realistic `added_at` difference within a party's lifetime.

**Missing party:** If the party record is not found in storage, the processor throws immediately without attempting to update the track. No partial writes occur.

**Invalid `trackId` format:** The algorithm parses `trackId` as a compound `provider:id` string. If the format is invalid, the utility function responsible for parsing (`unsafeGetProviderAndId`, a separate module) may throw, aborting the transaction. Behavior in this case depends on that module (separate translation task).

**Invariant - order of currently-playing track:** The currently-playing track must always have `order` equal to `Number.MIN_SAFE_INTEGER + 1`. This invariant is enforced by the algorithm whenever the track undergoes a vote update. However, the invariant is not enforced for tracks that are designated as "currently playing" by external mechanisms (e.g. playback advancing to the next track) - that is handled by a separate module.

**Invariant - vote_count reflects reality:** After a successful transaction, the stored `vote_count` for a non-playing track equals the algebraic sum of all `+1` and `-1` vote deltas applied to it. A playing track's `vote_count` is frozen at the value it had when playback started.

---

## 6. Open Questions

**Q1 - Transaction model in Postgres.** Festify uses a Firebase RTDB client-side transaction (optimistic concurrency with automatic retry) to atomically read and write the track record. In Postgres the equivalent is either `UPDATE ... WHERE` with a compare-and-swap on the `order` column (optimistic concurrency) or `SELECT ... FOR UPDATE` (pessimistic locking). Which pattern fits CrowdTune's expected concurrency level? At low vote frequency, an optimistic `UPDATE tracks SET order = $new WHERE party_id = $pid AND track_id = $tid AND order = $old_order` with application-level retry is idiomatic. At high frequency, row-level locking may be cleaner. Flag for schema and handler author to decide. Candidate: use optimistic concurrency with a retry loop capped at three attempts; escalate to a row lock on repeated contention.

**Q2 - Event trigger architecture.** Festify uses a Firebase Cloud Function triggered directly on a database write path. In CrowdTune there is no equivalent reactive trigger on Postgres writes. Candidates: (a) the vote-cast HTTP endpoint itself calls the reranking logic synchronously before returning; (b) a Postgres NOTIFY + Go listener runs the reranking asynchronously; (c) a polling worker reruns ranking on a short interval. Option (a) is simplest and gives the client immediate consistency. Option (b) preserves the decoupled nature. Flag for orchestrator to decide architecture before handler dispatch.

**Q3 - `VOTE_FACTOR` constant value.** Festify hardcodes this as 10^12 milliseconds. This assumes `added_at - party_created_at` is measured in milliseconds and that no party runs longer than roughly 31 years (10^12 ms / (365 * 24 * 3600 * 1000)). In Postgres, timestamps are stored as microseconds or as a `timestamptz`. The formula must use a consistent unit. If `added_at` and `created_at` are stored as millisecond integers (bigint), the constant can be ported directly. If they are stored as `timestamptz`, the subtraction yields an `interval` and the constant must be converted accordingly. Flag: confirm timestamp column type before porting the formula.

**Q4 - `Number.MIN_SAFE_INTEGER + 1` as a sort sentinel.** JavaScript's `Number.MIN_SAFE_INTEGER` is -9007199254740991. Postgres `bigint` minimum is -9223372036854775808, which is safely below that value, so the sentinel fits in a `bigint` column. However, if `order` is stored as a Postgres `float8` (double precision), the representation is exact at this magnitude. Confirm: should `order` be `bigint` or `float8`? The formula produces a mix of integer arithmetic and potentially fractional values (if timestamps are not aligned). Candidate: store `order` as `bigint`, compute in application code using integer arithmetic throughout.

**Q5 - Process-local LRU cache for party creation dates.** The Festify implementation uses a module-level in-memory LRU cache that persists across Cloud Function warm invocations. In a Go service, this would be an in-process map or cache struct. If multiple Go processes run concurrently (horizontal scaling), each has its own cache - this is acceptable because the party's `created_at` is treated as immutable. However, if a party record is created and immediately voted on before the cache is warm, the handler must fall back to a DB read. Candidate: implement a simple `sync.Map` or `ristretto` cache bounded by count. Flag for implementer.

**Q6 - Loose equality check for `order` change detection.** Festify uses loose equality (`==` rather than `===`) when comparing the existing `order` to the newly computed `order`. This is presumably to handle cases where the stored value is a string representation of a number. In Go + Postgres, values retrieved from the database are strongly typed, so a strict numeric comparison is appropriate. The no-op optimization (skip the write when `order` has not changed) should still be implemented, but using strict equality.

**Q7 - Behavior when `topmostTrack` fetch and `updateOrder` transaction are not atomic.** Festify fetches the current topmost track and the party creation date in parallel (via `Promise.all`), then runs the transaction. Between the fetch and the transaction, the topmost track may change (e.g. playback advances). The transaction does not re-read the topmost track; it relies on the value fetched before the transaction began. This means the "is this the currently-playing track?" check inside the transaction can be stale. Should CrowdTune's implementation re-read the currently-playing track inside the transaction/lock to guarantee correctness? Flag for orchestrator.

**Q8 - User authorization on votes.** The source file does not show authorization checks - vote events are triggered by any write to the vote path. In CrowdTune, who is allowed to vote? Any authenticated user in the party, or only guests who have explicitly joined? What prevents a user from voting multiple times? The data model (one record per `partyId / trackId / userId`) implies one vote per user per track. Whether the backend enforces that a user can only vote on tracks in parties they belong to is not stated in this file. Flag for auth design.

---

## 7. Festify-Specific Quirks To Reconsider

**Real-time RTDB trigger vs. HTTP endpoint.** The entire vote-processing pipeline is triggered by a Firebase RTDB `onWrite` listener on the votes path. There is no HTTP handler involved. CrowdTune must expose an HTTP endpoint for casting and retracting votes, and decide at that endpoint whether ranking is computed synchronously (in the handler) or asynchronously (via a background worker or Postgres notification). This is a fundamental architectural divergence. The Festify model provides near-instant reranking with no client round-trip needed; a synchronous HTTP approach provides the same consistency but adds latency to the vote response.

**Firebase RTDB transactions with automatic retry.** Festify's `transaction()` call on a RTDB reference handles optimistic concurrency transparently - the SDK retries the transaction function if the data changed between read and write. Go + Postgres has no equivalent magic; retry logic must be written explicitly by the implementer.

**`firebase.database.ServerValue.TIMESTAMP` for `added_at`.** This is a special Firebase sentinel that is replaced by the server's current time at the moment the write is committed. In Postgres, the equivalent is `DEFAULT NOW()` on the column or an explicit `NOW()` in the `INSERT` statement. The implementer must ensure `added_at` is always set to the server time, never the client's reported time.

**Compound key encoding in `trackId`.** Festify encodes the track's streaming provider and provider-native ID into a single string key (format: `provider:id`). This serves as both the Firebase RTDB child key and the track identifier. In CrowdTune, the track identifier can be split into separate `provider` (text) and `provider_track_id` (text) columns, with a composite uniqueness constraint on `(party_id, provider, provider_track_id)`. The compound key encoding should not be preserved as a single opaque string in Postgres; decomposing it improves queryability and prevents encoding ambiguity. The HTTP API may receive a compound string from the client and decompose it server-side.

**`unsafeGetProviderAndId` dependency.** The processor imports a utility function named `unsafeGetProviderAndId` from a sibling module (`./utils`). This function is responsible for parsing the compound `trackId` string. It is a separate translation task and must be specced independently. The vote-processor implementer should treat provider/ID decomposition as a dependency injected from a shared utility package.

**LRU cache as module-level state.** Festify's LRU cache is a module-level singleton that persists for the lifetime of the Cloud Function instance. In Go, the equivalent is a package-level variable or a struct field on the handler/service. Module-level mutable state requires careful consideration of concurrency (use `sync.RWMutex` or a thread-safe cache library). The cache should be initialized once at startup, not per-request.

**Denormalized `vote_count` on the track record.** Festify stores a `vote_count` integer directly on the track record and updates it atomically inside the same transaction that updates `order`. This denormalization avoids a `COUNT(*)` query on the votes table every time ranking is recomputed. In Postgres, the implementer must decide: maintain a denormalized `vote_count` column on `queue_tracks` (updated on every vote insert/delete), or compute vote counts from the `user_votes` table on the fly. The denormalized approach is more consistent with the Festify behavior and avoids aggregate queries in the hot path. A `CHECK` constraint or trigger can enforce that `vote_count >= 0`.

**Security rules embedded in path structure.** Festify's Firebase RTDB security rules are not visible in this file, but the path structure `votes/{partyId}/{trackId}/{userId}` implies that write access is controlled per-user-per-track-per-party at the storage layer. In Go + Postgres, authorization is enforced in the HTTP handler layer, not at the storage layer. The handler must validate that the authenticated user's JWT `sub` matches the `userId` being voted, that the party exists and is active, and that the track is in the party's queue.

---

## 8. Data Model Implications

### Table: `parties`

The processor reads one field from a party record - the creation timestamp - and treats it as immutable. The `parties` table therefore needs at minimum:

- `id`: text (or UUID), primary key. The opaque party identifier used throughout the vote path.
- `created_at`: a server-assigned timestamp, stored as either a bigint (milliseconds since epoch) or a `timestamptz`. Required. Must be non-null. Set at party creation and never updated.
- Additional columns (name, host user ID, playback state) are needed by other modules but are not read by the vote processor.

Cardinality: one row per party.

### Table: `queue_tracks`

This is the central table the vote processor reads and writes. One row per track per party.

- `party_id`: text or UUID, foreign key referencing `parties.id`. Required. Part of the composite primary key or a uniqueness constraint.
- `track_id`: an opaque compound string in Festify. In CrowdTune, this should be split into `provider` (text, e.g. `spotify`) and `provider_track_id` (text, the provider-native ID). The pair `(party_id, provider, provider_track_id)` must be unique.
- `added_at`: bigint (milliseconds) or `timestamptz`. Server-assigned at insert time. Never updated. Used in the ranking formula.
- `vote_count`: integer. Denormalized count of net upvotes. Default 0. Updated atomically with `order` on every vote event. Must be >= 0 for non-playing tracks (a constraint the processor maintains by deleting rather than allowing negative counts).
- `order`: bigint or float8. The computed sort key. Lower values appear earlier. Updated on every vote event. Indexed for fast ascending-order scans (the "topmost track" query needs to retrieve the minimum `order` track quickly).
- `is_fallback`: boolean. Default false. Set to true by a different module for auto-queued fallback tracks. Read by the vote processor to decide whether to retain a zero-vote track.
- `reference_provider`: text. The streaming provider name. Set at insert time, never updated.
- `reference_id`: text. The provider-native track ID. Set at insert time, never updated.

Cardinality: one party has many queue tracks. One track (identified by provider+id) may appear in multiple parties (different rows).

Constraints the algorithm relies on:
- Unique constraint on `(party_id, provider, provider_track_id)` - ensures one record per track per party.
- The `order` column must be indexed with `ORDER BY order ASC` to efficiently serve the "topmost track" read.
- No row for a given `(party_id, provider, provider_track_id)` implies the track is absent from the queue. A null row and an absent row are equivalent; the processor creates the row on first vote and deletes it when vote count reaches zero (for non-fallback, non-playing tracks).

### Table: `user_votes`

The vote processor does not read from a votes table directly - it is triggered by a write to that table (in Festify) or inferred from the HTTP request (in CrowdTune). However, the one-vote-per-user-per-track invariant implied by the path structure `votes/{partyId}/{trackId}/{userId}` requires a deduplicated votes table.

- `party_id`: text or UUID, foreign key to `parties.id`.
- `provider`: text. The streaming provider.
- `provider_track_id`: text. The provider-native track ID.
- `user_id`: text. The JWT `sub` claim of the user who voted. References the Neon Auth user table (quoted as `neon_auth."user"`).
- `voted_at`: timestamptz. Server-assigned at vote time. Not used by the vote processor but useful for auditing and rate-limiting.

Cardinality: one user may vote on many tracks; one track may receive votes from many users. Unique constraint on `(party_id, provider, provider_track_id, user_id)` enforces one vote per user per track per party.

The vote-cast HTTP endpoint will `INSERT` into `user_votes` (or `DELETE` for a retraction), then call the ranking update logic. The existence of a row in `user_votes` after the insert corresponds to `voteDelta = +1`; its absence after the delete corresponds to `voteDelta = -1`.

### Indexes

- `queue_tracks (party_id, order ASC)`: used by the "topmost track" query (`SELECT ... WHERE party_id = $1 ORDER BY order ASC LIMIT 1`).
- `queue_tracks (party_id, provider, provider_track_id)`: used for the per-track lookup in the ranking transaction.
- `user_votes (party_id, provider, provider_track_id, user_id)`: unique index enforcing one vote per user per track.

---

## 9. Endpoints Implied

### Cast or retract a vote

Intent: an authenticated user signals approval of a specific track in a specific party's queue. Casting adds the vote; retracting removes it. The result is a net change of +1 or -1 to that track's vote count and a recomputed sort position.

URL shape candidate: `POST /api/parties/{partyId}/tracks/{provider}/{trackId}/vote` for casting, `DELETE /api/parties/{partyId}/tracks/{provider}/{trackId}/vote` for retracting. Alternatively, a single `PUT` endpoint with a body field indicating the desired vote state (voted or not voted).

Authorization: any authenticated user who is a member of the party (either as host or as a joined guest). Anonymous users may not vote. The server must verify that the caller's JWT `sub` matches the user being represented and that the party exists and is in an active (not ended) state.

What it mutates: inserts or deletes a row in `user_votes`, then triggers the ranking update for the affected track in `queue_tracks` (updating `order` and `vote_count`).

What it returns: on success, the updated track record (new `order`, new `vote_count`) or a 204 No Content. On failure (party not found, track not in queue, user not in party, double-vote attempt), an appropriate 4xx status with an error message.

### Add a track to the party queue

Intent: a user nominates a track for the party's queue. If the track is not yet in the queue, it is created with an initial vote count of zero (or of one if the nomination implicitly casts a vote). The vote processor handles the creation case when a vote is cast for a track that does not yet exist in `queue_tracks`.

URL shape candidate: `POST /api/parties/{partyId}/tracks`

Authorization: any authenticated party member (host or guest).

What it mutates: may insert a row into `queue_tracks` if the track did not already exist. If the nomination implicitly casts a vote, also inserts into `user_votes` and triggers ranking.

What it returns: the newly created or existing track record with its current `order` and `vote_count`.

### Read the current queue

Intent: a client fetches the ordered list of tracks for a party's queue, sorted by `order` ascending. The topmost track is the currently-playing (or next-to-play) track.

URL shape candidate: `GET /api/parties/{partyId}/tracks`

Authorization: any authenticated user; the TV display view (`/tv/{partyId}`) may allow unauthenticated reads for display-only purposes (open question, see Q8).

What it mutates: nothing. Read-only.

What it returns: an array of track records ordered by `order` ascending. Each record includes at minimum: `provider`, `provider_track_id`, `vote_count`, `added_at`, `is_fallback`, and a display metadata blob (track name, artist, album art) that would come from a Spotify lookup - handled by a separate module.

### Read a single party record (including `created_at`)

Intent: fetches the party metadata needed to compute the ranking formula. The vote processor reads `created_at` from the party record. The handler serving this data must ensure `created_at` is accurate and immutable.

URL shape candidate: `GET /api/parties/{partyId}`

Authorization: any authenticated user.

What it mutates: nothing.

What it returns: at minimum `id` and `created_at` (millisecond timestamp). Full party metadata (name, host, playback state) would be included for client use.
