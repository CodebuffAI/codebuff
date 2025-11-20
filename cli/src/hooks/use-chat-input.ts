import { useCallback, useEffect, useRef } from 'react'
import stringWidth from 'string-width'

import type { InputValue } from '../state/chat-store'
import type { AgentMode } from '../utils/constants'

interface UseChatInputOptions {
  inputValue: string
  setInputValue: (value: InputValue) => void
  agentMode: AgentMode
  setAgentMode: (mode: AgentMode) => void
  separatorWidth: number
  initialPrompt: string | null
  onSubmitPrompt: (content: string, mode: AgentMode) => void | Promise<unknown>
}

const BUILD_IT_TEXT = 'Build it!'

export const useChatInput = ({
  inputValue,
  setInputValue,
  agentMode,
  setAgentMode,
  separatorWidth,
  initialPrompt,
  onSubmitPrompt,
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
  }
}
