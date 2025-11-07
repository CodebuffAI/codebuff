import { useCallback, useEffect, useRef } from 'react'
import stringWidth from 'string-width'

import { logger } from '../utils/logger'

import type { SendMessageFn } from '../types/contracts/send-message'
import type { AgentMode } from '../utils/constants'

interface UseChatInputOptions {
  inputValue: string
  setInputValue: (value: string) => void
  agentMode: AgentMode
  setAgentMode: (mode: AgentMode) => void
  separatorWidth: number
  initialPrompt: string | null
  sendMessageRef: React.MutableRefObject<SendMessageFn | undefined>
}

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
  const MODE_LABELS = { FAST: 'FAST', MAX: 'MAX', PLAN: 'PLAN' } as const
  const collapsedContentWidth = stringWidth(` < ${MODE_LABELS[agentMode]} `)
  const collapsedBoxWidth = collapsedContentWidth + 2 // account for │ │
  const gapWidth = 2 // paddingLeft on the toggle container
  const estimatedToggleWidth = collapsedBoxWidth + gapWidth
  const inputWidth = Math.max(1, separatorWidth - estimatedToggleWidth)

  const handleBuildFast = useCallback(() => {
    setAgentMode('FAST')
    setInputValue('Build it!')
    setTimeout(() => {
      if (sendMessageRef.current) {
        sendMessageRef.current({ content: 'Build it!', agentMode: 'FAST' })
      }
      setInputValue('')
    }, 0)
  }, [setAgentMode, setInputValue, sendMessageRef])

  const handleBuildMax = useCallback(() => {
    setAgentMode('MAX')
    setInputValue('Build it!')
    setTimeout(() => {
      if (sendMessageRef.current) {
        sendMessageRef.current({ content: 'Build it!', agentMode: 'MAX' })
      }
      setInputValue('')
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
