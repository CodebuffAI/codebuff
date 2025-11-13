import { useCallback, useEffect, useRef } from 'react'
import stringWidth from 'string-width'
import { withMessageHistory } from '@codebuff/sdk'

import type { ChatMessage } from '../types/chat'
import type { InputValue } from '../state/chat-store'
import type { SendMessageFn } from '../types/contracts/send-message'
import type { AgentMode } from '../utils/constants'
import type { RunState } from '@codebuff/sdk'

interface UseChatInputOptions {
  inputValue: string
  setInputValue: (value: InputValue) => void
  agentMode: AgentMode
  setAgentMode: (mode: AgentMode) => void
  separatorWidth: number
  initialPrompt: string | null
  sendMessageRef: React.MutableRefObject<SendMessageFn | undefined>
  messages: ChatMessage[]
  setMessages: (
    value: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void
  previousRunState: RunState | null
  setPreviousRunState: (runState: RunState | null) => void
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
  messages,
  setMessages,
  previousRunState,
  setPreviousRunState,
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

  const handleBuildFast = useCallback(
    (messageId: string) => {
      setAgentMode('DEFAULT')
      
      // Update previousRunState to trim messageHistory
      if (previousRunState) {
        const messageIndex = messages.findIndex((msg) => msg.id === messageId)
        if (messageIndex !== -1) {
          // Get all messages up to and including the plan message
          const trimmedMessages = messages.slice(0, messageIndex + 1)
          
          // Convert ChatMessage[] to SDK Message[] format (just keep user/assistant content)
          const sdkMessages = trimmedMessages
            .filter((msg) => msg.variant === 'user' || msg.variant === 'ai')
            .map((msg) => ({
              role: msg.variant === 'user' ? ('user' as const) : ('assistant' as const),
              content: msg.content || '',
            }))
          
          // Update the previousRunState with trimmed message history
          const updatedRunState = withMessageHistory({
            runState: previousRunState,
            messages: sdkMessages,
          })
          setPreviousRunState(updatedRunState)
        }
      }
      
      if (sendMessageRef.current) {
        sendMessageRef.current({
          content: BUILD_IT_TEXT,
          agentMode: 'DEFAULT',
          postUserMessage: (prev) => {
            // Trim the message history to only include messages up to the plan
            const index = prev.findIndex((msg) => msg.id === messageId)
            return index !== -1 ? prev.slice(0, index + 1) : prev
          },
        })
      }
    },
    [setAgentMode, sendMessageRef, messages, setMessages, previousRunState, setPreviousRunState],
  )

  const handleBuildMax = useCallback(
    (messageId: string) => {
      // Find the index of the message containing the plan
      const messageIndex = messages.findIndex((msg) => msg.id === messageId)
      if (messageIndex !== -1) {
        // Remove all messages after the plan message
        setMessages(messages.slice(0, messageIndex + 1))
        
        // Update previousRunState to trim messageHistory
        if (previousRunState) {
          const trimmedMessages = messages.slice(0, messageIndex + 1)
          
          // Convert ChatMessage[] to SDK Message[] format
          const sdkMessages = trimmedMessages
            .filter((msg) => msg.variant === 'user' || msg.variant === 'ai')
            .map((msg) => ({
              role: msg.variant === 'user' ? ('user' as const) : ('assistant' as const),
              content: msg.content || '',
            }))
          
          // Update the previousRunState with trimmed message history
          const updatedRunState = withMessageHistory({
            runState: previousRunState,
            messages: sdkMessages,
          })
          setPreviousRunState(updatedRunState)
        }
      }

      setAgentMode('MAX')
      setInputValue({
        text: BUILD_IT_TEXT,
        cursorPosition: BUILD_IT_TEXT.length,
        lastEditDueToNav: true,
      })
      setTimeout(() => {
        if (sendMessageRef.current) {
          sendMessageRef.current({
            content: 'Build it!',
            agentMode: 'MAX',
            postUserMessage: (prev) => {
              // Trim the message history to only include messages up to the plan
              const index = prev.findIndex((msg) => msg.id === messageId)
              return index !== -1 ? prev.slice(0, index + 1) : prev
            },
          })
        }
        setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
      }, 0)
    },
    [setAgentMode, setInputValue, sendMessageRef, messages, setMessages, previousRunState, setPreviousRunState],
  )

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
