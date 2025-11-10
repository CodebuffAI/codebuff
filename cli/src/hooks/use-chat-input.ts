import { useCallback, useEffect, useRef } from 'react'
import stringWidth from 'string-width'

import type { InputValue } from '../state/chat-store'
import type { SendMessageFn } from '../types/contracts/send-message'
import type { AgentMode } from '../utils/constants'

interface UseChatInputOptions {
  inputValue: string
  setInputValue: (value: InputValue) => void
  agentMode: AgentMode
  setAgentMode: (mode: AgentMode) => void
  separatorWidth: number
  initialPrompt: string | null
  sendMessageRef: React.MutableRefObject<SendMessageFn | undefined>
}

const BUILD_IT_TEXT = 'Build it!'

export const useChatInput = ({
  inputValue,
  setInputValue,
  agentMode,
  setAgentMode,
  separatorWidth,
  initialPrompt,
  sendMessageRef,
}: UseChatInputOptions) => {
  const hasAutoSubmittedRef = useRef(false)

  // Estimate the collapsed toggle width as rendered by AgentModeToggle.
  // Collapsed content is "< LABEL" with 1 column of padding on each side and
  // a vertical border on each edge. Include the inter-element gap (the right
  // container has paddingLeft: 2).
  const MODE_LABELS = { DEFAULT: 'DEFAULT', MAX: 'MAX', PLAN: 'PLAN' } as const
  const collapsedLabelWidth = stringWidth(`< ${MODE_LABELS[agentMode]}`)
  const horizontalPadding = 2 // one column padding on each side
  const collapsedBoxWidth = collapsedLabelWidth + horizontalPadding + 2 // include │ │
  const gapWidth = 2 // paddingLeft on the toggle container
  const estimatedToggleWidth = collapsedBoxWidth + gapWidth

  // The content box that wraps the input row has paddingLeft/paddingRight = 1
  // (see cli/src/chat.tsx). Subtract those columns so our MultilineInput width
  // matches the true drawable area between the borders.
  const contentPadding = 2 // 1 left + 1 right padding
  const availableContentWidth = Math.max(1, separatorWidth - contentPadding)
  const inputWidth = Math.max(1, availableContentWidth - estimatedToggleWidth)

  const handleBuildFast = useCallback(() => {
    setAgentMode('DEFAULT')
    setInputValue({
      text: BUILD_IT_TEXT,
      cursorPosition: BUILD_IT_TEXT.length,
      lastEditDueToNav: true,
    })
    setTimeout(() => {
      if (sendMessageRef.current) {
        sendMessageRef.current({ content: BUILD_IT_TEXT, agentMode: 'DEFAULT' })
      }
      setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
    }, 0)
  }, [setAgentMode, setInputValue, sendMessageRef])

  const handleBuildMax = useCallback(() => {
    setAgentMode('MAX')
    setInputValue({
      text: BUILD_IT_TEXT,
      cursorPosition: BUILD_IT_TEXT.length,
      lastEditDueToNav: true,
    })
    setTimeout(() => {
      if (sendMessageRef.current) {
        sendMessageRef.current({ content: 'Build it!', agentMode: 'MAX' })
      }
      setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
    }, 0)
  }, [setAgentMode, setInputValue, sendMessageRef])

  useEffect(() => {
    if (initialPrompt && !hasAutoSubmittedRef.current) {
      hasAutoSubmittedRef.current = true

      const timeout = setTimeout(() => {
        if (sendMessageRef.current) {
          sendMessageRef.current({ content: initialPrompt, agentMode })
        }
      }, 100)

      return () => clearTimeout(timeout)
    }
    return undefined
  }, [initialPrompt, agentMode, sendMessageRef])

  return {
    inputWidth,
    handleBuildFast,
    handleBuildMax,
  }
}
