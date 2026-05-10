# Spec: Track Selectors

## 1. Purpose

This module provides derived-data functions (selectors) that sit between raw track storage and the UI. Its primary jobs are: computing the ordered list of tracks in the party queue, enforcing a maximum track-duration filter, identifying the currently-playing track, comparing track identity across heterogeneous data shapes, generating human-readable vote-status labels for each queue entry, and identifying which tracks still need background artwork or audio metadata fetched. Together these functions allow every queue-adjacent component in the app to consume pre-sorted, pre-filtered, labeled track data without duplicating sort or filter logic.

---

## 2. Public Contract

### 2a. Track Identity Key

A function that accepts either a full track object or a bare track reference and returns a single string that uniquely identifies the track across music providers.

- Input: a track object (which contains an embedded reference) or a standalone track reference. Both carry a provider field (string, e.g. "spotify") and a provider-native track id (string).
- Output: a single string formed by joining the provider name and the provider id with a hyphen delimiter. This string is used as the canonical key for all track lookups throughout the rest of this module.
- No state read. No state mutated. Pure, synchronous.

### 2b. All-Tracks Map Accessor

Reads the party's track collection from state and returns it as a map keyed by track identity string. Returns an empty map when the collection is absent.

- State observed: the tracks collection nested under the current party in application state.
- Output: a map from track-identity-string to Track object. Never null; defaults to an empty object.

### 2c. Single-Track Accessor

Reads one track from state by its track-identity string.

- Input: application state plus a track-identity string.
- Output: the Track at that key, or undefined if not present.
- State observed: same tracks collection as above.

### 2d. All-Metadata Map Accessor

Reads the full metadata cache from state and returns it as a map keyed by track-identity string.

- State observed: the top-level metadata cache in application state.
- Output: a map from track-identity-string to Metadata object. Never null; defaults to an empty object.

### 2e. Single-Metadata Accessor

Reads one Metadata entry from state by track-identity string.

- Input: application state plus a track-identity string.
- Output: the Metadata at that key, or null if absent.

### 2f. Artist Name Joiner (factory)

Each call to the factory produces an independent memoized function. The produced function reads the Metadata for a given track and produces a display-ready artist string.

- Input to the produced function: application state plus a track-identity string.
- Output: a string in one of these forms:
  - Null when no metadata is available or no artists are recorded.
  - The artist's name alone when there is exactly one artist.
  - A formatted string "Primary Artist feat. Second & Third" when there are two or more artists. The first artist appears before "feat."; all remaining artists are joined with " & ".

### 2g. Sorted-Tracks Factory

Accepts any tracks-map accessor function as a parameter and returns a memoized selector that produces an ordered, filtered array of Track objects from that source.

Input to the returned selector: application state.

State observed by the returned selector:
- The tracks map returned by the supplied accessor.
- The full metadata cache.
- The maximum-track-length setting from the current party's settings (in minutes). Absent or zero means no limit is enforced (treated as unlimited).

Output: an array of Track objects, possibly empty, after the following processing steps are applied (described in full in section 3).

Filtering criteria applied (see section 3 for ordering):
- Tracks that lack a complete reference (missing provider or missing id) are excluded.
- Tracks whose audio duration exceeds the party's maximum-track-length setting are excluded. A track whose metadata is not yet loaded is included (it passes this filter by default).

Sort key: the track's numeric order field, ascending.

### 2h. Queue Tracks Selector

A concrete instance of the sorted-tracks factory using the all-tracks map accessor as its source. Produces the full ordered queue.

- Output: array of Track objects, sorted by order field ascending, with incomplete-reference and over-duration tracks removed.

### 2i. Current Track Selector

Reads the queue tracks array and returns the first element, representing the track at the head of the queue (the one that is playing or about to play).

- Output: the first Track in the sorted queue, or null when the queue is empty.
- State observed: derived from the queue tracks selector output.

### 2j. Current Track Identity Key Selector

Reads the current track and returns its canonical identity string.

- Output: the identity string for the current track, or null when there is no current track.

### 2k. Track-Equality Utility

A plain (non-memoized) comparison function that checks whether two track values refer to the same underlying song.

- Inputs: two values that may each be a Track object, null, or undefined.
- Output: a boolean.
- Comparison rules (described in section 3).

### 2l. Vote-Status Label Generator (factory)

Each call to the factory accepts a single-track accessor function and returns a memoized selector that produces a human-readable status string for a given track.

- Input to the produced selector: application state plus a track-identity string.
- Output: a string (one of several predefined labels, described in section 3). Returns an empty string when the track or playback state is absent.
- State observed: the track returned by the supplied accessor, the current track, and the playback state.

### 2m. Fanart-Load Candidate Selector

Reads the queue and metadata cache and returns the subset of the first two queued tracks that do not yet have a background image loaded.

- Output: an array of pairs, each pair containing a track-identity string and the corresponding Metadata object. Array may be empty. Maximum length is two.
- State observed: full metadata cache and queue tracks array.

### 2n. Metadata-Load Candidate Selector

Reads the queue and metadata cache and returns the provider-native ids of tracks that still need their duration or other audio metadata fetched.

- Output: an array of provider-native id strings (not the composite identity strings - the raw id portion only). Array may be empty.
- A track is included when it has no metadata entry at all, or when its metadata entry exists but the duration field is null or undefined.

---

## 3. Behavior

### Track identity computation

To produce the canonical identity string for a track: inspect whether the input carries an embedded reference object. If it does, use that reference. If it does not, treat the input itself as the reference. Concatenate the provider name, a hyphen, and the provider-specific id. This string is the stable, cross-provider key used everywhere else.

### Sorted queue computation

Start from the raw tracks map. Convert the map values to an array. Apply two sequential filters:

1. Exclude any track that lacks a well-formed reference (missing provider name or missing id).
2. Compute the maximum allowed duration in milliseconds by multiplying the party setting (in minutes) by 60 000. If the setting is absent or zero, treat the limit as unlimited (no track is excluded by duration). For each remaining track, look up its metadata by the track's identity string. If metadata exists and its duration-in-milliseconds field exceeds the limit, exclude the track. If metadata does not yet exist for a track, the track is not excluded by this filter (absence of metadata is not a disqualifier).

After filtering, sort the remaining tracks by their numeric order field in ascending order. Lower order value means closer to the front of the queue.

The sort is performed on the order field using numeric subtraction, so it is a numeric comparison, not lexicographic. If two tracks share the same order value, the sort is stable (JavaScript's built-in sort is stable since ES2019), so their relative insertion order in the map iteration is preserved - this is not a guaranteed property the implementer should rely on; see section 6.

### Current track identification

The current track is simply the first element of the sorted, filtered queue. There is no separate "playing" flag evaluated here; position zero in the queue is the current track by definition.

### Track equality

Two track values are considered equal if any of the following conditions hold, checked in this order:

1. Both are the same object reference (or both are null/undefined via loose equality).
2. Either value is falsy (null or undefined) while the other is not - in this case they are NOT equal.
3. Both have the same embedded reference object (same reference by loose equality).
4. Either has no embedded reference - in this case they are NOT equal.
5. Both have the same provider string AND the same provider-specific id string - in this case they ARE equal.

The comparison intentionally uses loose equality (not strict) for the object-identity and reference-identity checks. This mirrors how Festify's Firebase-backed state may or may not produce new reference objects on re-render. In our stack this is a redesign decision - see section 6.

### Vote-status label generation

Given a track and the current playback context, produce a display label by evaluating conditions in this order:

1. If either the target track or the playback object is absent, return an empty string.
2. If the target track is the same as the current track (using the track-equality rule), return "Playing now" when playback indicates the party is actively playing, or "Paused" when it is not.
3. If the track's vote count is greater than one, return a string like "N Votes" where N is the vote count.
4. If the track's vote count is exactly one, return "One Vote".
5. If the track carries the fallback flag (it was added from the host's fallback playlist rather than by a guest vote), return "Fallback Track".
6. Otherwise return "Not in Queue".

This ordering means the currently-playing track always shows playback state regardless of vote count. Among non-current tracks, vote count takes priority over the fallback flag.

### Fanart-load candidate identification

Take the first two tracks from the sorted queue. For each, compute the identity string and check the metadata cache. If metadata exists for the track but it does not yet have a background image, include it in the result. Tracks with no metadata entry at all are excluded (cannot load fanart without metadata). Tracks that already have a background image are excluded.

### Metadata-load candidate identification

Walk the entire sorted queue. For each track, compute its identity string and check the metadata cache. Include the track's provider-native id (the id portion of the reference, not the composite key) in the output if either: no metadata entry exists for the track, or an entry exists but its duration field is null or undefined.

---

## 4. Side Effects

This module contains no direct network calls, storage writes, audio output, or SDK interactions. All functions are pure transformations of data that has already been loaded into the application's state layer. The fanart-load and metadata-load candidate selectors produce lists that signal to other parts of the system that fetches are needed, but they do not initiate those fetches themselves.

---

## 5. Edge Cases Worth Preserving

- Empty queue: the queue selector returns an empty array, the current-track selector returns null, and the vote-status selector returns an empty string for any track when the playback object is also absent.
- Track with no metadata yet: the sorted-queue filter treats missing metadata as duration-unknown and passes the track through. It will appear in the queue even before its duration is known.
- Track that exceeds the duration limit: excluded from the queue silently. No error is raised. The track simply does not appear in the sorted array.
- Track with zero votes and no fallback flag: the vote-status label returns "Not in Queue", which is the correct label for a track in an indeterminate state (referenced in state but not yet voted on and not from the fallback playlist).
- Track with one vote: the label is the word "One Vote" (not "1 Vote"), preserving the singular grammar.
- Fallback tracks: a track carrying the fallback flag is shown as "Fallback Track" only when it has zero votes and is not the current track. As soon as it receives a vote, the vote-count branch wins.
- Queue with a single track: that track is both the current track and the only queue entry.
- Party with no settings or no maximum-track-length setting: the duration filter is disabled; all tracks pass regardless of duration.
- Artist joiner with one artist: returns the artist name alone, with no "feat." suffix.
- Artist joiner with multiple artists: the second and subsequent artists are joined with " & " and appended after "feat." The first artist is never included in the " & " join.
- Null/undefined track inputs to the equality function: handled gracefully; the function returns false rather than throwing.

---

## 6. Open Questions for the Implementer

1. Vote sort ordering vs. order field: in this file the queue sort is on a numeric "order" field, not on vote count. The order field appears to be a pre-computed server-side value that already incorporates votes and tie-breaking. The implementer must determine whether the "order" field in our data model is equivalent, or whether we need to compute a derived sort key client-side from vote count and insertion time. If the latter, the implementer must define the comparator rule (likely: higher vote count sorts first; equal vote count resolved by earliest-added time; this is a redesign decision that must be confirmed before implementation begins).

2. Tie-breaking on the order field: if two tracks share the same order value, JavaScript's sort is stable (ES2019+) and will preserve insertion order, but map iteration order from a JavaScript object or a Postgres result set is not guaranteed to match the original insertion order. If true deterministic tie-breaking is needed, the implementer should add a secondary sort criterion (e.g., added-at timestamp ascending) to make the comparator fully deterministic without relying on sort stability.

3. Null / zero vote defensive handling: the vote-status label branches assume vote_count is a number and tests it against integer literals (greater than one, equal to one). A freshly-added track with undefined or null vote_count would fall through all numeric branches and land on the "Fallback Track" or "Not in Queue" branch. The implementer should decide whether to normalise absent vote counts to zero at the data layer or add a guard in the comparator and label logic.

4. Loose equality in track comparison: the Festify equality function uses loose equality (==) for object-identity checks, which catches null/undefined pairs in one step. In TypeScript strict mode this is a lint violation. The implementer should rewrite as explicit null checks (both are null, or both are undefined, or they are the same object by strict equality) to satisfy strict TypeScript without changing observable behaviour.

5. Duration field units: the duration limit is converted from minutes (the party setting) to milliseconds for comparison against metadata.durationMs. If our Postgres schema stores duration in seconds or as a string, the conversion must be adapted. Clarify the unit of the duration column in the tracks or metadata table before implementing the filter.

6. ISO 8601 timestamps vs. unix-ms: if our Track type stores the added-at field as an ISO 8601 string (as implied by the project's entity types), string comparison is safe for lex-ordered ISO strings at the same timezone, but only if the format is consistent (always UTC, always full precision). If tie-breaking by added-at is needed in the sort comparator, the implementer should use Date.parse() or compare the raw string if the format guarantees lexicographic ordering, and must document which is used.

7. Memoization strategy: Festify uses reselect's createSelector for all derived computations. In our stack there is no Redux store, so memoization is optional. For the sorted-queue computation (which runs a filter and sort over potentially hundreds of tracks), the implementer should consider using React.useMemo at the call site or proxy-memoize if the selector is invoked frequently. Flag for review during the component-wiring phase.

8. "order" field source of truth: clarify whether the "order" field is computed by a Cloud Function / Gin handler at write time (making the client-side sort trivially cheap) or whether the client is expected to derive ordering from vote_count and added_at. This determines whether the sort comparator in our stack is a one-field numeric sort or a multi-field comparator.

9. Fallback playlist flag: the is_fallback boolean on a Track signals that the track originated from the host's curated fallback playlist rather than from a guest vote action. Confirm that our Track entity type includes this field and that the Postgres schema has a corresponding column. If not, this needs to be added in the migration.

10. Subtraction-based numeric comparator and NaN: the sort comparator uses numeric subtraction (a.order - b.order). If order is ever NaN (e.g. a track newly added to the database before the field is initialised), the subtraction produces NaN, which causes unpredictable sort results. The implementer should add a guard that treats NaN order values as positive infinity (sorts to the end) or zero.

---

## 7. Stack Mapping Notes

- This entire file maps to the directory apps/web/src/entities/track/lib/ in our FSD structure. Functions that are tightly coupled (track identity, track equality, sorted-queue filter) may live together in a single file; the fanart and metadata load-candidate functions may be split into separate files since they are consumed by different features.

- The sorted-tracks factory pattern (accepting an arbitrary tracks-map accessor) is a Reselect-specific parameterised selector. In our stack this becomes an ordinary function that accepts a tracks map (Record of track-identity-string to Track) and a party context object (holding the max-duration setting) and returns a filtered, sorted array. The factory pattern itself is not needed unless we have multiple tracks maps (e.g. a separate "user's history" map and the live queue map).

- The queue tracks selector and current track selector become plain functions or, if reactive, TanStack Query's select option applied to the party/tracks query result. There is no Redux; the caller passes the data in.

- The vote-status label generator factory becomes a single plain function that accepts a Track, the current track, and the playback state. The factory-of-memoized-selector pattern is not needed in our stack.

- The fanart-load candidate and metadata-load candidate outputs feed into TanStack Query mutations or prefetch triggers, not into sagas or Firebase listeners.

- The artist-joiner factory becomes a single plain function (no factory needed) since we do not have multiple metadata maps.

- Depends on a party selector module (playbackSelector is imported from a sibling selectors file) - separate translation task for that module.

- Depends on the application state type definitions (State, Track, TrackReference, Metadata) - the entity types in our stack are described in the entities layer and should already be present from the state.ts translation task.

- The "order" field on Track must be confirmed in our entity type. If it is absent, the implementer must decide the sort key at design time before writing any code.
