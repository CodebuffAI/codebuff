import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import React from 'react'

import { QueuePanel } from '../../components/queue-panel'
import { useChatKeyboard } from '../../hooks/use-chat-keyboard'
import { useMessageQueue } from '../../hooks/use-message-queue'
import { initializeThemeStore } from '../../hooks/use-theme'
import { useQueuePanelStore } from '../../state/queue-panel-store'
import { createDefaultChatKeyboardState } from '../../utils/keyboard-actions'

import type { ChatKeyboardHandlers } from '../../hooks/use-chat-keyboard'

let cleanupRenderer: (() => void) | undefined

beforeAll(() => {
  initializeThemeStore()
})

beforeEach(() => {
  useQueuePanelStore.getState().closeQueuePanel()
})

afterEach(() => {
  cleanupRenderer?.()
  cleanupRenderer = undefined
  useQueuePanelStore.getState().closeQueuePanel()
})

const noopHandlers = (): ChatKeyboardHandlers =>
  new Proxy({} as ChatKeyboardHandlers, {
    get: () => () => {},
  })

/**
 * Composes the chain chat.tsx wires up — keypress → resolver → handler →
 * panel store → panel → queue ops — without dragging in auth, the SDK, and the
 * rest of the Chat surface. It is the seam a mis-wire would hide in.
 */
const mountChatQueue = async ({ queued }: { queued: string[] }) => {
  const state = { submitted: [] as string[] }

  const Harness = () => {
    const queue = useMessageQueue(
      // Hold the queue: a real run is in flight, which is the only time
      // messages pile up in the first place.
      () => Promise.resolve(),
      { current: true },
      { current: 0 },
    )
    const queuePanelOpen = useQueuePanelStore((s) => s.queuePanelOpen)
    const closeQueuePanel = useQueuePanelStore((s) => s.closeQueuePanel)

    // Seed once, the way routeUserPrompt does while a run is streaming.
    const seeded = React.useRef(false)
    if (!seeded.current) {
      seeded.current = true
      queued.forEach((content) => queue.addToQueue(content))
    }

    state.submitted = queue.queuedMessages.map((m) => m.content)

    useChatKeyboard({
      state: {
        ...createDefaultChatKeyboardState(),
        queuedCount: queue.queuedMessages.length,
      },
      handlers: {
        ...noopHandlers(),
        onOpenQueuePanel: () =>
          useQueuePanelStore.getState().openQueuePanel(),
      },
      // chat.tsx hands the keyboard to the panel while it is open.
      disabled: queuePanelOpen,
    })

    if (!queuePanelOpen) return <text>composer</text>

    return (
      <QueuePanel
        queuedMessages={queue.queuedMessages}
        onEdit={queue.editQueuedMessage}
        onDelete={queue.removeQueuedMessage}
        onMove={queue.moveQueuedMessage}
        onClose={closeQueuePanel}
        width={70}
      />
    )
  }

  const setup = await createTestRenderer({
    width: 70,
    height: 14,
    kittyKeyboard: true,
  })
  const root = createRoot(setup.renderer)
  cleanupRenderer = () => {
    flushSync(() => root.unmount())
    setup.renderer.destroy()
  }

  flushSync(() => root.render(<Harness />))
  await setup.renderOnce()

  const settle = async () => {
    await setup.renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await setup.renderOnce()
  }
  await settle()

  return Object.assign(setup, {
    queued: () => state.submitted,
    async press(act: () => void) {
      act()
      await settle()
    },
  })
}

const ctrlQ = (panel: { mockInput: { pressKey: Function } }) =>
  panel.mockInput.pressKey('q', { ctrl: true })

describe('editing the queue from chat', () => {
  test('ctrl+q opens the editor over the composer and edits the real queue', async () => {
    const panel = await mountChatQueue({
      queued: ['fix the login bug', 'add parser tests'],
    })
    expect(panel.captureCharFrame()).toContain('composer')

    await panel.press(() => ctrlQ(panel))
    expect(panel.captureCharFrame()).toContain('Queue — 2 messages')

    // Reorder, then delete what is now second — against the real queue hook.
    await panel.press(() => panel.mockInput.pressArrow('down'))
    await panel.press(() => panel.mockInput.pressKey('t'))
    expect(panel.queued()).toEqual(['add parser tests', 'fix the login bug'])

    await panel.press(() => panel.mockInput.pressArrow('down'))
    await panel.press(() => panel.mockInput.pressKey('d'))
    expect(panel.queued()).toEqual(['add parser tests'])
  })

  test('ctrl+q closes it again and the composer comes back', async () => {
    const panel = await mountChatQueue({ queued: ['fix the login bug'] })

    await panel.press(() => ctrlQ(panel))
    expect(panel.captureCharFrame()).toContain('Queue — 1 message')

    await panel.press(() => ctrlQ(panel))
    expect(panel.captureCharFrame()).toContain('composer')
  })

  test('ctrl+q does nothing with an empty queue', async () => {
    const panel = await mountChatQueue({ queued: [] })

    await panel.press(() => ctrlQ(panel))

    expect(panel.captureCharFrame()).toContain('composer')
    expect(useQueuePanelStore.getState().queuePanelOpen).toBe(false)
  })

  test('emptying the queue from the editor hands the composer back', async () => {
    const panel = await mountChatQueue({ queued: ['only one'] })

    await panel.press(() => ctrlQ(panel))
    await panel.press(() => panel.mockInput.pressKey('d'))

    expect(panel.queued()).toEqual([])
    expect(panel.captureCharFrame()).toContain('composer')
  })
})
