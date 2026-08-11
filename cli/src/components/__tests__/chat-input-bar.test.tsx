import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import React from 'react'

import { ChatInputBar } from '../chat-input-bar'
import { initializeThemeStore, useTheme } from '../../hooks/use-theme'
import { useChatStore } from '../../state/chat-store'

let cleanupRenderer: (() => void) | undefined

beforeAll(() => {
  initializeThemeStore()
})

afterEach(() => {
  cleanupRenderer?.()
  cleanupRenderer = undefined
  useChatStore.getState().reset()
})

const mountInput = async (
  onQueuePreviewClick: () => void,
  options: { compact?: boolean } = {},
) => {
  const Harness = () => {
    const theme = useTheme()
    const inputRef = React.useRef(null)

    return (
      <ChatInputBar
        inputValue=""
        cursorPosition={0}
        setInputValue={() => {}}
        inputFocused
        inputRef={inputRef}
        inputPlaceholder="composer"
        lastEditDueToNav={false}
        agentMode="DEFAULT"
        toggleAgentMode={() => {}}
        setAgentMode={() => {}}
        hasSlashSuggestions={false}
        hasMentionSuggestions={false}
        hasSuggestionMenu={false}
        slashSuggestionItems={[]}
        agentSuggestionItems={[]}
        fileSuggestionItems={[]}
        slashSelectedIndex={0}
        agentSelectedIndex={0}
        theme={theme}
        terminalHeight={12}
        separatorWidth={70}
        shouldCenterInputVertically={false}
        inputBoxTitle=" ▸ queued task   click to expand "
        onQueuePreviewClick={onQueuePreviewClick}
        isCompactHeight={options.compact ?? false}
        isNarrowWidth
        feedbackMode={false}
        handleExitFeedback={() => {}}
        publishMode={false}
        handleExitPublish={() => {}}
        handlePublish={async () => {}}
        handleSubmit={async () => {}}
        onPaste={() => {}}
        onInterruptStream={() => {}}
      />
    )
  }

  const setup = await createTestRenderer({ width: 70, height: 12 })
  const root = createRoot(setup.renderer)
  cleanupRenderer = () => {
    flushSync(() => root.unmount())
    setup.renderer.destroy()
  }

  flushSync(() => root.render(<Harness />))
  await setup.renderOnce()

  return setup
}

describe('ChatInputBar queue title', () => {
  test('clicking the collapsed queue title expands it', async () => {
    let clicks = 0
    const input = await mountInput(() => clicks++)

    expect(input.captureCharFrame()).toContain('click to expand')
    await input.mockMouse.click(35, 0)

    expect(clicks).toBe(1)
  })

  test('pressing without releasing does not expand the queue', async () => {
    let clicks = 0
    const input = await mountInput(() => clicks++)

    await input.mockMouse.pressDown(35, 0)

    expect(clicks).toBe(0)
  })

  test('clicking inside the composer does not expand the queue', async () => {
    let clicks = 0
    const input = await mountInput(() => clicks++)

    await input.mockMouse.click(10, 2)

    expect(clicks).toBe(0)
  })

  test('compact mode keeps a clickable queue preview', async () => {
    let clicks = 0
    const input = await mountInput(() => clicks++, { compact: true })

    expect(input.captureCharFrame()).toContain('click to expand')
    await input.mockMouse.click(10, 0)

    expect(clicks).toBe(1)
  })

  test('right-clicking the compact preview does not expand the queue', async () => {
    let clicks = 0
    const input = await mountInput(() => clicks++, { compact: true })

    await input.mockMouse.click(10, 0, 2)

    expect(clicks).toBe(0)
  })
})
