/**
 * GeneralSettingsPanel: left-side panel of PartySettings.
 *
 * Contains the party name, max track length, TV display text inputs,
 * three boolean toggles, and the flush queue button with confirmation modal.
 *
 * Auto-save: toggles save on flip; text/number inputs save on blur-when-changed.
 * Polarity notes (per spec section 3 + open question 1):
 * - allowMultipleVotesPerSearch: toggle ON = feature ON (straight). The Festify
 *   source used a negated label ("close search after adding") whose checkbox
 *   was inverted relative to the underlying field. CrowdTune relabels to the
 *   positive framing ("Keep search open after adding"), so the polarity is
 *   straight in this implementation.
 * - allowExplicitTracks: toggle ON = feature ON (straight).
 * - allowAnonymousVoting: toggle ON means "Require sign-in" is ON, which means
 *   allowAnonymousVoting=false. Inverted polarity preserved from source.
 *   Toggle displayed state = !allowAnonymousVoting; the onChange handler
 *   stores `!on` back into the field.
 */
import { useState, useRef } from 'react'
import {
  Switch,
  Label,
  Description,
  Input,
  Button,
  Modal,
} from '@heroui/react'

import type { PartySettings } from '@/entities/party'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_NAME_LENGTH = 100
const MAX_TV_TEXT_LENGTH = 200

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  partyName: string
  settings: PartySettings
  isSaving: boolean
  flushButtonRef: React.RefObject<HTMLButtonElement | null>
  isFlushPending: boolean
  onSave: (next: PartySettings) => void
  onSaveName: (name: string) => void
  onFlush: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GeneralSettingsPanel({
  partyName,
  settings,
  isSaving,
  flushButtonRef,
  isFlushPending,
  onSave,
  onSaveName,
  onFlush,
}: Props) {
  const [localName, setLocalName] = useState(partyName)
  const [localMaxLength, setLocalMaxLength] = useState<string>(
    settings.maxTrackLengthMinutes !== null
      ? String(settings.maxTrackLengthMinutes)
      : '',
  )
  const [localTvText, setLocalTvText] = useState(settings.tvDisplayText ?? '')
  const [nameError, setNameError] = useState('')
  const [maxLengthError, setMaxLengthError] = useState('')
  const [isFlushModalOpen, setIsFlushModalOpen] = useState(false)

  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const maxLengthInputRef = useRef<HTMLInputElement | null>(null)

  // ---------------------------------------------------------------------------
  // Party name handlers
  // ---------------------------------------------------------------------------
  function handleNameBlur() {
    if (localName.trim() === partyName.trim()) return
    if (localName.trim() === '') {
      setNameError('Party name is required.')
      nameInputRef.current?.focus()
      return
    }
    setNameError('')
    onSaveName(localName.trim())
  }

  // ---------------------------------------------------------------------------
  // Max track length handlers
  // ---------------------------------------------------------------------------
  function handleMaxLengthBlur() {
    const prev =
      settings.maxTrackLengthMinutes !== null
        ? String(settings.maxTrackLengthMinutes)
        : ''

    if (localMaxLength === prev) return

    if (localMaxLength === '') {
      onSave({ ...settings, maxTrackLengthMinutes: null })
      return
    }

    const parsed = Number(localMaxLength)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setMaxLengthError('Track length must be a whole number greater than zero.')
      maxLengthInputRef.current?.focus()
      return
    }

    setMaxLengthError('')
    onSave({ ...settings, maxTrackLengthMinutes: parsed })
  }

  // ---------------------------------------------------------------------------
  // TV display text handler
  // ---------------------------------------------------------------------------
  function handleTvTextBlur() {
    if (localTvText === settings.tvDisplayText) return
    onSave({ ...settings, tvDisplayText: localTvText })
  }

  // ---------------------------------------------------------------------------
  // Toggle handlers (all straight polarity except allowAnonymousVoting)
  // ---------------------------------------------------------------------------
  function handleToggleMultipleVotes(on: boolean) {
    onSave({ ...settings, allowMultipleVotesPerSearch: on })
  }

  function handleToggleExplicit(on: boolean) {
    onSave({ ...settings, allowExplicitTracks: on })
  }

  function handleToggleRequireSignIn(on: boolean) {
    // Toggle ON = "Require sign-in" = allowAnonymousVoting OFF (inverted).
    onSave({ ...settings, allowAnonymousVoting: !on })
  }

  // ---------------------------------------------------------------------------
  // Flush confirm handler
  // ---------------------------------------------------------------------------
  function handleFlushConfirm() {
    setIsFlushModalOpen(false)
    onFlush()
    // Focus returns to the flush button after modal close.
    setTimeout(() => flushButtonRef.current?.focus(), 0)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <section aria-label="General Settings">
      <h2 className="text-lg font-semibold mb-4">General Settings</h2>

      {/* Party Name */}
      <div className="flex flex-col gap-1 mb-4">
        <Label htmlFor="party-name-input">Party Name</Label>
        <Input
          id="party-name-input"
          ref={nameInputRef}
          aria-label="Party Name"
          aria-describedby={nameError ? 'party-name-error' : undefined}
          placeholder="My Party"
          value={localName}
          maxLength={MAX_NAME_LENGTH}
          fullWidth
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={handleNameBlur}
        />
        {nameError && (
          <p id="party-name-error" role="alert" className="text-sm text-danger">
            {nameError}
          </p>
        )}
      </div>

      {/* Max Track Length */}
      <div className="flex flex-col gap-1 mb-4">
        <Label htmlFor="max-track-length-input">Maximum Track Length (minutes)</Label>
        <Input
          id="max-track-length-input"
          ref={maxLengthInputRef}
          aria-label="Maximum Track Length (minutes)"
          aria-describedby={maxLengthError ? 'max-length-error' : undefined}
          type="number"
          min={1}
          step={1}
          placeholder=""
          value={localMaxLength}
          fullWidth
          onChange={(e) => setLocalMaxLength(e.target.value)}
          onBlur={handleMaxLengthBlur}
        />
        {maxLengthError && (
          <p id="max-length-error" role="alert" className="text-sm text-danger">
            {maxLengthError}
          </p>
        )}
      </div>

      {/* TV Display Text */}
      <div className="flex flex-col gap-1 mb-6">
        <Label htmlFor="tv-display-text-input">TV Display Text</Label>
        <Input
          id="tv-display-text-input"
          aria-label="TV Display Text"
          placeholder=""
          value={localTvText}
          maxLength={MAX_TV_TEXT_LENGTH}
          fullWidth
          onChange={(e) => setLocalTvText(e.target.value)}
          onBlur={handleTvTextBlur}
        />
        <p className="text-xs text-muted">
          Shown below the progress bar on large displays.
        </p>
      </div>

      {/* Toggles */}
      <div className="flex flex-col gap-4 mb-6">
        <Switch
          isSelected={settings.allowMultipleVotesPerSearch}
          isDisabled={isSaving}
          aria-label="Keep search open after adding"
          onChange={handleToggleMultipleVotes}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Content>
            <Label className="text-sm">Keep search open after adding</Label>
            <Description className="text-xs text-muted">
              When on, guests can add multiple tracks in one search session without
              reopening the search panel.
            </Description>
          </Switch.Content>
        </Switch>

        <Switch
          isSelected={settings.allowExplicitTracks}
          isDisabled={isSaving}
          aria-label="Allow explicit tracks"
          onChange={handleToggleExplicit}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Content>
            <Label className="text-sm">Allow explicit tracks</Label>
            <Description className="text-xs text-muted">
              When off, guests cannot add tracks flagged as explicit by Spotify. Note:
              Spotify&apos;s explicit tagging is not 100% reliable.
            </Description>
          </Switch.Content>
        </Switch>

        <Switch
          isSelected={!settings.allowAnonymousVoting}
          isDisabled={isSaving}
          aria-label="Require sign-in to vote"
          onChange={handleToggleRequireSignIn}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Content>
            <Label className="text-sm">Require sign-in to vote</Label>
            <Description className="text-xs text-muted">
              When on, guests must sign in with a social account before casting votes,
              reducing spam.
            </Description>
          </Switch.Content>
        </Switch>

        {isSaving && (
          <p className="sr-only" aria-live="polite">
            Saving...
          </p>
        )}
      </div>

      {/* Flush Queue button + confirmation modal */}
      <Modal>
        <Button
          ref={flushButtonRef}
          variant="danger"
          isDisabled={isFlushPending}
          aria-label="Flush queue - removes all tracks except the currently playing one"
          onPress={() => setIsFlushModalOpen(true)}
        >
          {isFlushPending ? 'Flushing...' : 'Flush Queue'}
        </Button>

        <Modal.Backdrop
          isOpen={isFlushModalOpen}
          onOpenChange={setIsFlushModalOpen}
          isDismissable={false}
        >
          <Modal.Container>
            <Modal.Dialog
              className="sm:max-w-sm"
              aria-label="Confirm flush queue"
            >
              <Modal.Header>
                <Modal.Heading>Flush queue?</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <p className="text-sm text-muted">
                  This will remove all tracks from the queue except the one currently
                  playing. This cannot be undone.
                </p>
              </Modal.Body>
              <Modal.Footer>
                <Button
                  variant="secondary"
                  slot="close"
                  onPress={() => {
                    setIsFlushModalOpen(false)
                    setTimeout(() => flushButtonRef.current?.focus(), 0)
                  }}
                >
                  Cancel
                </Button>
                <Button variant="danger" onPress={handleFlushConfirm}>
                  Flush
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </section>
  )
}
