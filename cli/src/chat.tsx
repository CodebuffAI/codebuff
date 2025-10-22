import { useRenderer } from '@opentui/react'
import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { MultilineInput } from './components/multiline-input'
import { Separator } from './components/separator'
import { StatusIndicator, useHasStatus } from './components/status-indicator'
import { SuggestionMenu } from './components/suggestion-menu'
import { SLASH_COMMANDS } from './data/slash-commands'
import { useClipboard } from './hooks/use-clipboard'
import { useInputHistory } from './hooks/use-input-history'
import { useKeyboardHandlers } from './hooks/use-keyboard-handlers'
import { useMessageQueue } from './hooks/use-message-queue'
import { useMessageRenderer } from './hooks/use-message-renderer'
import { useChatScrollbox } from './hooks/use-scroll-management'
import { useSendMessage } from './hooks/use-send-message'
import { useSuggestionEngine } from './hooks/use-suggestion-engine'
import { useSystemThemeDetector } from './hooks/use-system-theme-detector'
import { useChatStore } from './state/chat-store'
import { createChatScrollAcceleration } from './utils/chat-scroll-accel'
import { formatQueuedPreview } from './utils/helpers'
import { loadLocalAgents } from './utils/local-agent-registry'
import { logger } from './utils/logger'
import { buildMessageTree } from './utils/message-tree-utils'
import { chatThemes, createMarkdownPalette } from './utils/theme-system'

import type { ToolName } from '@codebuff/sdk'
import type { InputRenderable, ScrollBoxRenderable } from '@opentui/core'

type ChatVariant = 'ai' | 'user' | 'agent'

const MAX_VIRTUALIZED_TOP_LEVEL = 60
const VIRTUAL_OVERSCAN = 12

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
      agentId?: string
    }
  | {
      type: 'agent'
      agentId: string
      agentName: string
      agentType: string
      content: string
      status: 'running' | 'complete'
      blocks?: ContentBlock[]
      initialPrompt?: string
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

export const App = ({
  initialPrompt,
  agentId,
}: { initialPrompt?: string; agentId?: string } = {}) => {
  const renderer = useRenderer()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const inputRef = useRef<InputRenderable | null>(null)

  const themeName = useSystemThemeDetector()
  const theme = chatThemes[themeName]
  const markdownPalette = useMemo(() => createMarkdownPalette(theme), [theme])

  const {
    inputValue,
    setInputValue,
    inputFocused,
    setInputFocused,
    slashSelectedIndex,
    setSlashSelectedIndex,
    agentSelectedIndex,
    setAgentSelectedIndex,
    collapsedAgents,
    setCollapsedAgents,
    streamingAgents,
    setStreamingAgents,
    focusedAgentId,
    setFocusedAgentId,
    messages,
    setMessages,
    activeSubagents,
    setActiveSubagents,
    isChainInProgress,
    setIsChainInProgress,
  } = useChatStore(
    useShallow((store) => ({
      inputValue: store.inputValue,
      setInputValue: store.setInputValue,
      inputFocused: store.inputFocused,
      setInputFocused: store.setInputFocused,
      slashSelectedIndex: store.slashSelectedIndex,
      setSlashSelectedIndex: store.setSlashSelectedIndex,
      agentSelectedIndex: store.agentSelectedIndex,
      setAgentSelectedIndex: store.setAgentSelectedIndex,
      collapsedAgents: store.collapsedAgents,
      setCollapsedAgents: store.setCollapsedAgents,
      streamingAgents: store.streamingAgents,
      setStreamingAgents: store.setStreamingAgents,
      focusedAgentId: store.focusedAgentId,
      setFocusedAgentId: store.setFocusedAgentId,
      messages: store.messages,
      setMessages: store.setMessages,
      activeSubagents: store.activeSubagents,
      setActiveSubagents: store.setActiveSubagents,
      isChainInProgress: store.isChainInProgress,
      setIsChainInProgress: store.setIsChainInProgress,
    })),
  )

  const activeAgentStreamsRef = useRef<number>(0)
  const isChainInProgressRef = useRef<boolean>(isChainInProgress)

  const { clipboardMessage } = useClipboard()

  const agentRefsMap = useRef<Map<string, any>>(new Map())
  const hasAutoSubmittedRef = useRef(false)
  const activeSubagentsRef = useRef<Set<string>>(activeSubagents)

  useEffect(() => {
    isChainInProgressRef.current = isChainInProgress
  }, [isChainInProgress])

  useEffect(() => {
    activeSubagentsRef.current = activeSubagents
  }, [activeSubagents])

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

  const { scrollToLatest, scrollToAgent, scrollboxProps, isAtBottom } =
    useChatScrollbox(scrollRef, messages, agentRefsMap)

  const inertialScrollAcceleration = useMemo(
    () => createChatScrollAcceleration(),
    [],
  )

  const appliedScrollboxProps = inertialScrollAcceleration
    ? { ...scrollboxProps, scrollAcceleration: inertialScrollAcceleration }
    : scrollboxProps

  const localAgents = useMemo(() => loadLocalAgents(), [])

  const {
    slashContext,
    mentionContext,
    slashMatches,
    agentMatches,
    slashSuggestionItems,
    agentSuggestionItems,
  } = useSuggestionEngine({
    inputValue,
    slashCommands: SLASH_COMMANDS,
    localAgents,
  })

  useEffect(() => {
    if (!slashContext.active) {
      setSlashSelectedIndex(0)
      return
    }
    setSlashSelectedIndex(0)
  }, [slashContext.active, slashContext.query])

  useEffect(() => {
    if (slashMatches.length > 0 && slashSelectedIndex >= slashMatches.length) {
      setSlashSelectedIndex(slashMatches.length - 1)
    }
    if (slashMatches.length === 0 && slashSelectedIndex !== 0) {
      setSlashSelectedIndex(0)
    }
  }, [slashMatches.length, slashSelectedIndex])

  useEffect(() => {
    if (!mentionContext.active) {
      setAgentSelectedIndex(0)
      return
    }
    setAgentSelectedIndex(0)
  }, [mentionContext.active, mentionContext.query])

  useEffect(() => {
    if (agentMatches.length > 0 && agentSelectedIndex >= agentMatches.length) {
      setAgentSelectedIndex(agentMatches.length - 1)
    }
    if (agentMatches.length === 0 && agentSelectedIndex !== 0) {
      setAgentSelectedIndex(0)
    }
  }, [agentMatches.length, agentSelectedIndex])

  const handleSlashMenuKey = useCallback(
    (
      key: any,
      helpers: {
        value: string
        cursorPosition: number
        setValue: (newValue: string) => number
        setCursorPosition: (position: number) => void
      },
    ): boolean => {
      if (!slashContext.active || slashMatches.length === 0) {
        return false
      }

      const hasModifier = Boolean(key.ctrl || key.meta || key.alt || key.option)

      if (key.name === 'down' && !hasModifier) {
        setSlashSelectedIndex((prev) =>
          Math.min(prev + 1, slashMatches.length - 1),
        )
        return true
      }

      if (key.name === 'up' && !hasModifier) {
        setSlashSelectedIndex((prev) => Math.max(prev - 1, 0))
        return true
      }

      if (key.name === 'tab' && key.shift && !hasModifier) {
        setSlashSelectedIndex((prev) => Math.max(prev - 1, 0))
        return true
      }

      if (key.name === 'tab' && !key.shift && !hasModifier) {
        setSlashSelectedIndex((prev) =>
          Math.min(prev + 1, slashMatches.length - 1),
        )
        return true
      }

      if (key.name === 'return' && !key.shift && !hasModifier) {
        const selected = slashMatches[slashSelectedIndex] ?? slashMatches[0]
        if (!selected) {
          return true
        }
        const startIndex = slashContext.startIndex
        if (startIndex < 0) {
          return true
        }
        const before = helpers.value.slice(0, startIndex)
        const after = helpers.value.slice(
          startIndex + 1 + slashContext.query.length,
          helpers.value.length,
        )
        const replacement = `/${selected.id} `
        const newValue = before + replacement + after
        helpers.setValue(newValue)
        helpers.setCursorPosition(before.length + replacement.length)
        setSlashSelectedIndex(0)
        return true
      }

      return false
    },
    [
      slashContext.active,
      slashContext.startIndex,
      slashContext.query,
      slashMatches,
      slashSelectedIndex,
    ],
  )

  const handleAgentMenuKey = useCallback(
    (
      key: any,
      helpers: {
        value: string
        cursorPosition: number
        setValue: (newValue: string) => number
        setCursorPosition: (position: number) => void
      },
    ): boolean => {
      if (!mentionContext.active || agentMatches.length === 0) {
        return false
      }

      const hasModifier = Boolean(key.ctrl || key.meta || key.alt || key.option)

      if (key.name === 'down' && !hasModifier) {
        setAgentSelectedIndex((prev) =>
          Math.min(prev + 1, agentMatches.length - 1),
        )
        return true
      }

      if (key.name === 'up' && !hasModifier) {
        setAgentSelectedIndex((prev) => Math.max(prev - 1, 0))
        return true
      }

      if (key.name === 'tab' && key.shift && !hasModifier) {
        setAgentSelectedIndex((prev) => Math.max(prev - 1, 0))
        return true
      }

      if (key.name === 'tab' && !key.shift && !hasModifier) {
        setAgentSelectedIndex((prev) =>
          Math.min(prev + 1, agentMatches.length - 1),
        )
        return true
      }

      if (key.name === 'return' && !key.shift && !hasModifier) {
        const selected = agentMatches[agentSelectedIndex] ?? agentMatches[0]
        if (!selected) {
          return true
        }
        const startIndex = mentionContext.startIndex
        if (startIndex < 0) {
          return true
        }

        const before = helpers.value.slice(0, startIndex)
        const after = helpers.value.slice(
          startIndex + 1 + mentionContext.query.length,
          helpers.value.length,
        )
        const replacement = `@${selected.displayName} `
        const newValue = before + replacement + after
        helpers.setValue(newValue)
        helpers.setCursorPosition(before.length + replacement.length)
        setAgentSelectedIndex(0)
        return true
      }

      return false
    },
    [
      mentionContext.active,
      mentionContext.startIndex,
      mentionContext.query,
      agentMatches,
      agentSelectedIndex,
    ],
  )

  const handleSuggestionMenuKey = useCallback(
    (
      key: any,
      helpers: {
        value: string
        cursorPosition: number
        setValue: (newValue: string) => number
        setCursorPosition: (position: number) => void
      },
    ): boolean => {
      if (handleSlashMenuKey(key, helpers)) {
        return true
      }

      if (handleAgentMenuKey(key, helpers)) {
        return true
      }

      return false
    },
    [handleSlashMenuKey, handleAgentMenuKey],
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
    setActiveSubagents,
    setIsChainInProgress,
    setIsWaitingForResponse,
    startStreaming,
    stopStreaming,
    setIsStreaming,
    setCanProcessQueue,
    abortControllerRef,
    agentId,
  })

  sendMessageRef.current = sendMessage

  useEffect(() => {
    if (initialPrompt && !hasAutoSubmittedRef.current) {
      hasAutoSubmittedRef.current = true

      const timeout = setTimeout(() => {
        logger.info({ prompt: initialPrompt }, 'Auto-submitting initial prompt')
        if (sendMessageRef.current) {
          sendMessageRef.current(initialPrompt)
        }
      }, 100)

      return () => clearTimeout(timeout)
    }
    return undefined
  }, [initialPrompt])

  const hasStatus = useHasStatus(isWaitingForResponse, clipboardMessage)

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

    setTimeout(() => {
      scrollToLatest()
    }, 0)
  }, [
    inputValue,
    isStreaming,
    sendMessage,
    saveToHistory,
    addToQueue,
    streamMessageIdRef,
    isChainInProgressRef,
    scrollToLatest,
  ])

  useKeyboardHandlers({
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

  const { tree: messageTree, topLevelMessages } = useMemo(
    () => buildMessageTree(messages),
    [messages],
  )

  const shouldVirtualize =
    isAtBottom && topLevelMessages.length > MAX_VIRTUALIZED_TOP_LEVEL

  const virtualTopLevelMessages = useMemo(() => {
    if (!shouldVirtualize) {
      return topLevelMessages
    }
    const windowSize = MAX_VIRTUALIZED_TOP_LEVEL + VIRTUAL_OVERSCAN
    const sliceStart = Math.max(0, topLevelMessages.length - windowSize)
    return topLevelMessages.slice(sliceStart)
  }, [shouldVirtualize, topLevelMessages])

  const hiddenTopLevelCount = Math.max(
    0,
    topLevelMessages.length - virtualTopLevelMessages.length,
  )

  const messageItems = useMessageRenderer({
    messages,
    messageTree,
    topLevelMessages: virtualTopLevelMessages,
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

  const virtualizationNotice =
    shouldVirtualize && hiddenTopLevelCount > 0 ? (
      <text key="virtualization-notice" wrap={false} style={{ width: '100%' }}>
        <span fg={theme.statusSecondary}>
          Showing latest {virtualTopLevelMessages.length} of{' '}
          {topLevelMessages.length} messages. Scroll up to load more.
        </span>
      </text>
    ) : null

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
          {...appliedScrollboxProps}
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
          {virtualizationNotice}
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
        {slashContext.active && slashSuggestionItems.length > 0 ? (
          <SuggestionMenu
            items={slashSuggestionItems}
            selectedIndex={slashSelectedIndex}
            theme={theme}
            maxVisible={5}
            prefix="/"
          />
        ) : null}
        {!slashContext.active &&
        mentionContext.active &&
        agentSuggestionItems.length > 0 ? (
          <SuggestionMenu
            items={agentSuggestionItems}
            selectedIndex={agentSelectedIndex}
            theme={theme}
            maxVisible={5}
            prefix="@"
          />
        ) : null}
        <MultilineInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          placeholder="Share your thoughts and press Enter…"
          focused={inputFocused}
          maxHeight={5}
          theme={theme}
          width={renderer.width}
          onKeyIntercept={handleSuggestionMenuKey}
        />
        <Separator theme={theme} width={renderer.width} />
      </box>
    </box>
  )
}
