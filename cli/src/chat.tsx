import { useRenderer } from '@opentui/react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { MultilineInput } from './components/multiline-input'
import { Separator } from './components/separator'
import { StatusIndicator, useHasStatus } from './components/status-indicator'
import { useClipboard } from './hooks/use-clipboard'
import { useInputHistory } from './hooks/use-input-history'
import { useKeyboardHandlers } from './hooks/use-keyboard-handlers'
import { useMessageQueue } from './hooks/use-message-queue'
import { useMessageRenderer } from './hooks/use-message-renderer'
import { useScrollManagement } from './hooks/use-scroll-management'
import { useSendMessage } from './hooks/use-send-message'
import { formatTimestamp, formatQueuedPreview } from './utils/helpers'
import { logger } from './utils/logger'
import { buildMessageTree } from './utils/message-tree-utils'
import {
  type ThemeName,
  chatThemes,
  createMarkdownPalette,
  detectSystemTheme,
} from './utils/theme-system'

import type { ToolName } from '@codebuff/sdk'
import type { InputRenderable, ScrollBoxRenderable } from '@opentui/core'

type ChatVariant = 'ai' | 'user' | 'agent'

type AgentMessage = {
  agentName: string
  agentType: string
  responseCount: number
  subAgentCount?: number
}

export type ContentBlock =
  | { type: 'text'; content: string }
  | {
      type: 'tool'
      toolCallId: string
      toolName: ToolName
      input: any
      output?: string
    }
  | {
      type: 'agent'
      agentId: string
      agentName: string
      agentType: string
      content: string
      status: 'running' | 'complete'
    }

export type ChatMessage = {
  id: string
  variant: ChatVariant
  content: string
  blocks?: ContentBlock[]
  timestamp: string
  parentId?: string
  agent?: AgentMessage
  isCompletion?: boolean
  credits?: number
  completionTime?: string
  isComplete?: boolean
}

export const App = ({ initialPrompt }: { initialPrompt?: string } = {}) => {
  const renderer = useRenderer()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const inputRef = useRef<InputRenderable | null>(null)

  const [themeName, setThemeName] = useState<ThemeName>(() =>
    detectSystemTheme(),
  )
  const theme = chatThemes[themeName]
  const markdownPalette = useMemo(() => createMarkdownPalette(theme), [theme])

  const [inputValue, setInputValue] = useState<string>('')
  const [inputFocused, setInputFocused] = useState<boolean>(true)

  const activeAgentStreamsRef = useRef<number>(0)
  const isChainInProgressRef = useRef<boolean>(false)

  const { clipboardMessage } = useClipboard()

  const [collapsedAgents, setCollapsedAgents] = useState<Set<string>>(new Set())
  const [streamingAgents, setStreamingAgents] = useState<Set<string>>(new Set())
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null)
  const agentRefsMap = useRef<Map<string, any>>(new Map())

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'ai-seed-1',
      variant: 'ai',
      content:
        "Hey there! Welcome to the demo — feel free to ask anything or just say hello when you're ready.",
      timestamp: formatTimestamp(),
    },
  ])

  const completionCallbackRef = useRef<(() => void) | null>(null)
  const hasAutoSubmittedRef = useRef(false)
  const activeSubagentsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    renderer?.setBackgroundColor(theme.background)
  }, [renderer, theme.background])

  const abortControllerRef = useRef<AbortController | null>(null)

  const registerAgentRef = useCallback((agentId: string, element: any) => {
    if (element) {
      agentRefsMap.current.set(agentId, element)
    } else {
      agentRefsMap.current.delete(agentId)
    }
  }, [])

  const { scrollToAgent } = useScrollManagement(
    scrollRef,
    messages,
    agentRefsMap,
  )

  const { saveToHistory, navigateUp, navigateDown } = useInputHistory(
    inputValue,
    setInputValue,
  )

  const sendMessageRef =
    useRef<(content: string, onComplete?: () => void) => Promise<void>>()

  const {
    queuedMessages,
    isStreaming,
    isWaitingForResponse,
    streamMessageIdRef,
    addToQueue,
    startStreaming,
    stopStreaming,
    setIsWaitingForResponse,
    setCanProcessQueue,
    setIsStreaming,
  } = useMessageQueue(
    (content: string) => sendMessageRef.current?.(content) ?? Promise.resolve(),
    isChainInProgressRef,
    activeAgentStreamsRef,
  )

  const { sendMessage } = useSendMessage({
    setMessages,
    setFocusedAgentId,
    setInputFocused,
    inputRef,
    setStreamingAgents,
    setCollapsedAgents,
    activeSubagentsRef,
    isChainInProgressRef,
    setIsWaitingForResponse,
    startStreaming,
    stopStreaming,
    setIsStreaming,
    setCanProcessQueue,
    abortControllerRef,
    completionCallbackRef,
  })

  sendMessageRef.current = sendMessage

  const hasStatus = useHasStatus(isWaitingForResponse, clipboardMessage)

  useEffect(() => {
    if (initialPrompt && !hasAutoSubmittedRef.current) {
      hasAutoSubmittedRef.current = true

      const timeout = setTimeout(() => {
        logger.info('Auto-submitting initial prompt', { prompt: initialPrompt })

        const handleCompletion = () => {
          logger.info('Initial prompt completed, reading log file')

          setTimeout(() => {
            if (renderer) {
              renderer.destroy()
            }

            setTimeout(() => {
              try {
                const fs = require('fs')
                const path = require('path')
                const logPath = path.join(process.cwd(), 'debug', 'cli.log')

                if (fs.existsSync(logPath)) {
                  const logContents = fs.readFileSync(logPath, 'utf8')
                  process.stdout.write('\n=== Debug Log Contents ===\n\n')
                  process.stdout.write(logContents)
                  process.stdout.write('\n\n=== End of Debug Log ===\n\n')
                } else {
                  process.stdout.write(
                    'Log file not found at: ' + logPath + '\n',
                  )
                }
              } catch (error) {
                process.stdout.write(
                  'Error reading log file: ' + String(error) + '\n',
                )
              }

              process.exit(0)
            }, 100)
          }, 500)
        }

        const timeoutId = setTimeout(() => {
          logger.warn('2-minute timeout reached, exiting')
          handleCompletion()
        }, 120000)

        sendMessage(initialPrompt, () => {
          clearTimeout(timeoutId)
          handleCompletion()
        })
      }, 100)

      return () => clearTimeout(timeout)
    }
    return undefined
  }, [initialPrompt, sendMessage])

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return

    saveToHistory(trimmed)
    setInputValue('')

    if (
      isStreaming ||
      streamMessageIdRef.current ||
      isChainInProgressRef.current
    ) {
      addToQueue(trimmed)
      setInputFocused(true)
      inputRef.current?.focus()
      return
    }

    sendMessage(trimmed)
  }, [
    inputValue,
    isStreaming,
    sendMessage,
    saveToHistory,
    addToQueue,
    streamMessageIdRef,
    isChainInProgressRef,
  ])

  const handleThemeToggle = useCallback(() => {
    setThemeName((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  useKeyboardHandlers({
    onThemeToggle: handleThemeToggle,
    isStreaming,
    isWaitingForResponse,
    abortControllerRef,
    focusedAgentId,
    setFocusedAgentId,
    setInputFocused,
    inputRef,
    setCollapsedAgents,
    navigateUp,
    navigateDown,
  })

  const { tree: messageTree, topLevelMessages } = buildMessageTree(messages)

  const messageItems = useMessageRenderer({
    messages,
    messageTree,
    topLevelMessages,
    availableWidth: renderer?.width ?? 80,
    theme,
    markdownPalette,
    collapsedAgents,
    streamingAgents,
    isWaitingForResponse,
    setCollapsedAgents,
    setFocusedAgentId,
    registerAgentRef,
    scrollToAgent,
  })

  return (
    <box
      style={{
        flexDirection: 'column',
        gap: 0,
        paddingLeft: 1,
        paddingRight: 1,
        flexGrow: 1,
      }}
    >
      <box
        style={{
          flexDirection: 'column',
          flexGrow: 1,
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          backgroundColor: theme.panelBg,
        }}
      >
        <scrollbox
          ref={scrollRef}
          stickyScroll
          stickyStart="bottom"
          scrollX={false}
          scrollbarOptions={{ visible: false }}
          style={{
            flexGrow: 1,
            rootOptions: {
              flexGrow: 1,
              padding: 0,
              gap: 0,
              flexDirection: 'column',
              shouldFill: true,
              backgroundColor: theme.panelBg,
            },
            wrapperOptions: {
              flexGrow: 1,
              border: false,
              shouldFill: true,
              backgroundColor: theme.panelBg,
            },
            contentOptions: {
              flexDirection: 'column',
              gap: 0,
              shouldFill: true,
              justifyContent: 'flex-end',
              backgroundColor: theme.panelBg,
            },
          }}
        >
          {messageItems}
        </scrollbox>
      </box>

      <box
        style={{
          flexShrink: 0,
          paddingLeft: 0,
          paddingRight: 0,
          backgroundColor: theme.panelBg,
        }}
      >
        {(hasStatus || queuedMessages.length > 0) && (
          <>
            <text wrap={false} style={{ width: '100%' }}>
              <StatusIndicator
                isProcessing={isWaitingForResponse}
                theme={theme}
                clipboardMessage={clipboardMessage}
              />
              {hasStatus && queuedMessages.length > 0 && '  '}
              {queuedMessages.length > 0 && (
                <span fg={theme.statusSecondary} bg={theme.inputFocusedBg}>
                  {' '}
                  {formatQueuedPreview(
                    queuedMessages,
                    Math.max(30, renderer.width - 25),
                  )}{' '}
                </span>
              )}
            </text>
          </>
        )}
        <Separator theme={theme} width={renderer.width} />
        <MultilineInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          placeholder="Share your thoughts and press Enter…"
          focused={inputFocused}
          maxHeight={5}
          theme={theme}
          width={renderer.width}
        />
        <Separator theme={theme} width={renderer.width} />
      </box>
    </box>
  )
}
