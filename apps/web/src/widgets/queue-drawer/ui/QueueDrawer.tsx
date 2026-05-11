import { Drawer } from '@heroui/react'

import { QueueNav, type QueueNavProps } from './QueueNav'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QueueDrawerProps = QueueNavProps & {
  isOpen: boolean
  onClose: () => void
}

// ---------------------------------------------------------------------------
// QueueDrawer
//
// Modal-style sidebar for narrow viewports. Wraps QueueNav in HeroUI's
// Drawer chrome (backdrop, slide-in animation, React Aria focus trap,
// Escape-to-close, backdrop-tap-to-close). For wide-viewport rendering,
// PartyPage imports QueueNav directly and skips the modal chrome entirely.
// ---------------------------------------------------------------------------

export function QueueDrawer({ isOpen, onClose, ...navProps }: QueueDrawerProps) {
  return (
    <Drawer.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) onClose() }}
      isDismissable
    >
      <Drawer.Content placement="left" className="max-w-xs w-72">
        <Drawer.Dialog aria-label="Navigation menu">
          <QueueNav {...navProps} />
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}
