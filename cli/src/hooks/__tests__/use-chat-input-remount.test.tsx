import { expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import React, { useCallback, useRef, useState } from 'react'

import { useChatInput } from '../use-chat-input'

test('initial prompt is submitted only once across Chat remounts', async () => {
  const submissions: string[] = []
  let setShowHistory: ((show: boolean) => void) | undefined

  const ChatView = ({
    consumeInitialPrompt,
  }: {
    consumeInitialPrompt: () => string | null
  }) => {
    useChatInput({
      setInputValue: () => {},
      agentMode: 'DEFAULT',
      setAgentMode: () => {},
      separatorWidth: 80,
      consumeInitialPrompt,
      onSubmitPrompt: (content) => {
        submissions.push(content)
      },
      isCompactHeight: false,
      isNarrowWidth: false,
    })
    return <text>chat</text>
  }

  const AppLifetime = () => {
    const initialPromptConsumedRef = useRef(false)
    const consumeInitialPrompt = useCallback(() => {
      if (initialPromptConsumedRef.current) return null
      initialPromptConsumedRef.current = true
      return 'launch prompt'
    }, [])
    const [showHistory, setHistory] = useState(false)
    setShowHistory = setHistory

    return showHistory ? (
      <text>history</text>
    ) : (
      <ChatView consumeInitialPrompt={consumeInitialPrompt} />
    )
  }

  const setup = await createTestRenderer({ width: 80, height: 3 })
  const root = createRoot(setup.renderer)

  try {
    flushSync(() => root.render(<AppLifetime />))
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(submissions).toEqual(['launch prompt'])

    flushSync(() => setShowHistory!(true))
    flushSync(() => setShowHistory!(false))
    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(submissions).toEqual(['launch prompt'])
  } finally {
    flushSync(() => root.unmount())
    setup.renderer.destroy()
  }
})
