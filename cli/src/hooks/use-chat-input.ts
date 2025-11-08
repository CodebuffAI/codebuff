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

  // Estimate the actual collapsed toggle width as rendered by AgentModeToggle
  // Collapsed content is: " < " + LABEL + " " inside a bordered box.
  // Full width = contentWidth + 2 (vertical borders). We also include the
  // inter-element gap (the right container has paddingLeft: 2).
  const MODE_LABELS = { DEFAULT: 'DEFAULT', MAX: 'MAX', PLAN: 'PLAN' } as const
  const collapsedContentWidth = stringWidth(` < ${MODE_LABELS[agentMode]} `)
  const collapsedBoxWidth = collapsedContentWidth + 2 // account for │ │
  const gapWidth = 2 // paddingLeft on the toggle container
  const estimatedToggleWidth = collapsedBoxWidth + gapWidth
  const inputWidth = Math.max(1, separatorWidth - estimatedToggleWidth)

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
