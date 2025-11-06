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

  const agentToggleLabel =
    agentMode === 'FAST' ? 'FAST' : agentMode === 'MAX' ? '💪 MAX' : '📋 PLAN'
  const agentTogglePadding = agentMode === 'FAST' ? 4 : 2
  const agentToggleGap = 2
  const estimatedToggleWidth =
    agentTogglePadding + agentToggleGap + stringWidth(agentToggleLabel)
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
        logger.info({ prompt: initialPrompt }, 'Auto-submitting initial prompt')
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
