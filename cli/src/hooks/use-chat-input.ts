import { useCallback, useEffect, useRef } from 'react'
import stringWidth from 'string-width'

import { useChatStore } from '../state/chat-store'

import type { InputValue } from '../types/store'
import type { AgentMode } from '../utils/constants'

interface UseChatInputOptions {
  setInputValue: (value: InputValue) => void
  agentMode: AgentMode
  setAgentMode: (mode: AgentMode) => void
  separatorWidth: number
  initialPrompt: string | null
  onSubmitPrompt: (content: string, mode: AgentMode) => void | Promise<unknown>
  isCompactHeight: boolean
  isNarrowWidth: boolean
}

const BUILD_IT_TEXT = 'Build it!'

export const useChatInput = ({
  setInputValue,
  agentMode,
  setAgentMode,
  separatorWidth,
  initialPrompt,
  onSubmitPrompt,
  isCompactHeight,
  isNarrowWidth,
}: UseChatInputOptions) => {
  const hasAutoSubmittedRef = useRef(false)
  const inputMode = useChatStore((state) => state.inputMode)

  // Estimate the collapsed toggle width as rendered by AgentModeToggle.
  // In bash mode, compact height, or narrow width, we don't show the toggle, so no width needed.
  const estimatedToggleWidth = inputMode !== 'default' || isCompactHeight || isNarrowWidth
    ? 0
    : stringWidth(`< ${agentMode}`) + 6 // 2 padding + 2 borders + 2 gap

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
      onSubmitPrompt(BUILD_IT_TEXT, 'DEFAULT')
      setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
    }, 0)
  }, [setAgentMode, setInputValue, onSubmitPrompt])

  const handleBuildMax = useCallback(() => {
    setAgentMode('MAX')
    setInputValue({
      text: BUILD_IT_TEXT,
      cursorPosition: BUILD_IT_TEXT.length,
      lastEditDueToNav: true,
    })
    setTimeout(() => {
      onSubmitPrompt('Build it!', 'MAX')
      setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
    }, 0)
  }, [setAgentMode, setInputValue, onSubmitPrompt])

  const handleBuildFree = useCallback(() => {
    setAgentMode('FREE')
    setInputValue({
      text: BUILD_IT_TEXT,
      cursorPosition: BUILD_IT_TEXT.length,
      lastEditDueToNav: true,
    })
    setTimeout(() => {
      onSubmitPrompt(BUILD_IT_TEXT, 'FREE')
      setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
    }, 0)
  }, [setAgentMode, setInputValue, onSubmitPrompt])

  useEffect(() => {
    if (initialPrompt && !hasAutoSubmittedRef.current) {
      hasAutoSubmittedRef.current = true

      setTimeout(() => {
        onSubmitPrompt(initialPrompt, agentMode)
      }, 100)
    }
    return undefined
  }, [initialPrompt, agentMode, onSubmitPrompt])

  return {
    inputWidth,
    handleBuildFast,
    handleBuildMax,
    handleBuildFree,
  }
}
