import type { PartySettings } from '@/entities/party'

/**
 * Default party settings applied when `party.settings` is absent.
 *
 * Sourced from `@/entities/party/model/types.ts` documented defaults. The
 * `tvDisplayText` value is a CrowdTune-original string; it is intentionally
 * NOT borrowed from the Festify source. If product confirms a different
 * default copy, update this constant only.
 */
export const DEFAULT_SETTINGS: PartySettings = {
  allowAnonymousVoting: true,
  allowExplicitTracks: true,
  allowMultipleVotesPerSearch: true,
  tvDisplayText: 'Join the queue at crowdtune.app',
  maxTrackLengthMinutes: null,
}
