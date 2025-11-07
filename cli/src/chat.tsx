import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { routeUserPrompt } from './commands/router'
import { AgentModeToggle } from './components/agent-mode-toggle'
import { BuildModeButtons } from './components/build-mode-buttons'
import { LoginModal } from './components/login-modal'
import {
  MultilineInput,
  type MultilineInputHandle,
} from './components/multiline-input'
import { StatusIndicator, useHasStatus } from './components/status-indicator'
import { SuggestionMenu } from './components/suggestion-menu'
import { SLASH_COMMANDS } from './data/slash-commands'
import { useAgentInitialization } from './hooks/use-agent-initialization'
import { useAgentValidation } from './hooks/use-agent-validation'
import { useAuthState } from './hooks/use-auth-state'
import { useChatInput } from './hooks/use-chat-input'
import { useClipboard } from './hooks/use-clipboard'
import { useElapsedTime } from './hooks/use-elapsed-time'
import { useInputHistory } from './hooks/use-input-history'
import { useKeyboardHandlers } from './hooks/use-keyboard-handlers'
import { useLogo } from './hooks/use-logo'
import { useMessageQueue } from './hooks/use-message-queue'
import { useMessageRenderer } from './hooks/use-message-renderer'
import { useChatScrollbox } from './hooks/use-scroll-management'
import { useSendMessage } from './hooks/use-send-message'
import { useSuggestionEngine } from './hooks/use-suggestion-engine'
import { useTerminalDimensions } from './hooks/use-terminal-dimensions'
import { useTheme, useResolvedThemeName } from './hooks/use-theme'
import { useValidationBanner } from './hooks/use-validation-banner'
import { useChatStore } from './state/chat-store'
import { flushAnalytics } from './utils/analytics'
import { createChatScrollAcceleration } from './utils/chat-scroll-accel'
import { formatQueuedPreview } from './utils/helpers'
import { loadLocalAgents } from './utils/local-agent-registry'
import { buildMessageTree } from './utils/message-tree-utils'
import { createMarkdownPalette } from './utils/theme-system'
import { BORDER_CHARS } from './utils/ui-constants'

import type { SendMessageTimerEvent } from './hooks/use-send-message'
import type { SendMessageFn } from './types/contracts/send-message'
import type { ScrollBoxRenderable } from '@opentui/core'

const MAX_VIRTUALIZED_TOP_LEVEL = 60
const VIRTUAL_OVERSCAN = 12

const DEFAULT_AGENT_IDS = {
  FAST: 'base2-fast',
  MAX: 'base2-max',
  PLAN: 'base2-plan',
} as const

export const App = ({
  initialPrompt,
  agentId,
  requireAuth,
  hasInvalidCredentials,
  loadedAgentsData,
  validationErrors,
}: {
  initialPrompt: string | null
  agentId?: string
  requireAuth: boolean | null
  hasInvalidCredentials: boolean
  loadedAgentsData: {
    agents: Array<{ id: string; displayName: string }>
    agentsDir: string
  } | null
  validationErrors: Array<{ id: string; message: string }>
}) => {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const inputRef = useRef<MultilineInputHandle | null>(null)

  const { terminalWidth, separatorWidth, contentMaxWidth } =
    useTerminalDimensions()

  const theme = useTheme()
  const resolvedThemeName = useResolvedThemeName()
  const markdownPalette = useMemo(() => createMarkdownPalette(theme), [theme])
  const { textBlock: logoBlock } = useLogo({ availableWidth: contentMaxWidth })

  const { validationErrors: liveValidationErrors, validate: validateAgents } =
    useAgentValidation(validationErrors)

  const [exitWarning, setExitWarning] = useState<string | null>(null)
  const exitArmedRef = useRef(false)
  const exitWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  const {
    inputValue,
    setInputValue,
    cursorPosition,
    setCursorPosition,
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
    agentMode,
    setAgentMode,
    toggleAgentMode,
    hasReceivedPlanResponse,
    setHasReceivedPlanResponse,
    resetChatStore,
  } = useChatStore(
    useShallow((store) => ({
      inputValue: store.inputValue,
      setInputValue: store.setInputValue,
      cursorPosition: store.cursorPosition,
      setCursorPosition: store.setCursorPosition,
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
      agentMode: store.agentMode,
      setAgentMode: store.setAgentMode,
      toggleAgentMode: store.toggleAgentMode,
      hasReceivedPlanResponse: store.hasReceivedPlanResponse,
      setHasReceivedPlanResponse: store.setHasReceivedPlanResponse,
      resetChatStore: store.reset,
    })),
  )

  const {
    isAuthenticated,
    setIsAuthenticated,
    user,
    setUser,
    handleLoginSuccess,
    logoutMutation,
  } = useAuthState({
    requireAuth,
    hasInvalidCredentials,
    inputRef,
    setInputFocused,
    resetChatStore,
  })

  useAgentInitialization({
    loadedAgentsData,
    validationErrors,
    logoBlock,
    theme,
    separatorWidth,
    agentId,
    resolvedThemeName,
    messages,
    setMessages,
    setCollapsedAgents,
  })

  const showAgentDisplayName = !!agentId
  const agentDisplayName = useMemo(() => {
    if (!loadedAgentsData) return null

    const currentAgentId = agentId || DEFAULT_AGENT_IDS[agentMode]
    const agent = loadedAgentsData.agents.find((a) => a.id === currentAgentId)
    return agent?.displayName || currentAgentId
  }, [loadedAgentsData, agentId, agentMode])

  const activeAgentStreamsRef = useRef<number>(0)
  const isChainInProgressRef = useRef<boolean>(isChainInProgress)
  const { clipboardMessage } = useClipboard()
  const mainAgentTimer = useElapsedTime()
  const activeSubagentsRef = useRef<Set<string>>(activeSubagents)

  useEffect(() => {
    isChainInProgressRef.current = isChainInProgress
  }, [isChainInProgress])

  useEffect(() => {
    activeSubagentsRef.current = activeSubagents
  }, [activeSubagents])

  useEffect(() => {
    if (exitArmedRef.current && inputValue.length > 0) {
      exitArmedRef.current = false
      setExitWarning(null)
    }
  }, [inputValue])

  const abortControllerRef = useRef<AbortController | null>(null)

  const { scrollToLatest, scrollboxProps, isAtBottom } = useChatScrollbox(
    scrollRef,
    messages,
  )

  const inertialScrollAcceleration = useMemo(
    () => createChatScrollAcceleration(),
    [],
  )

  const appliedScrollboxProps = inertialScrollAcceleration
    ? { ...scrollboxProps, scrollAcceleration: inertialScrollAcceleration }
    : scrollboxProps

  const localAgents = useMemo(() => loadLocalAgents(), [])

  useEffect(() => {
    const handleSigint = () => {
      if (exitWarningTimeoutRef.current) {
        clearTimeout(exitWarningTimeoutRef.current)
        exitWarningTimeoutRef.current = null
      }

      exitArmedRef.current = false
      setExitWarning(null)

      const flushed = flushAnalytics()
      if (flushed && typeof (flushed as Promise<void>).finally === 'function') {
        ;(flushed as Promise<void>).finally(() => process.exit(0))
      } else {
        process.exit(0)
      }
    }

    process.on('SIGINT', handleSigint)
    return () => {
      process.off('SIGINT', handleSigint)
    }
  }, [])

  const [nextCtrlCWillExit, setNextCtrlCWillExit] = useState(false)
  const handleCtrlC = useCallback(() => {
    if (inputValue) {
      setInputValue('')
      return true
    }

    if (!nextCtrlCWillExit) {
      setNextCtrlCWillExit(true)
      setExitWarning('Press Ctrl+C again to exit')
      setTimeout(() => {
        setNextCtrlCWillExit(false)
        setExitWarning(null)
      }, 2000)
      return true
    }

    if (exitWarningTimeoutRef.current) {
      clearTimeout(exitWarningTimeoutRef.current)
      exitWarningTimeoutRef.current = null
    }

    exitArmedRef.current = false
    setExitWarning(null)

    flushAnalytics().then(() => process.exit(0))

    return true
  }, [
    inputValue,
    setInputValue,
    setExitWarning,
    nextCtrlCWillExit,
    setNextCtrlCWillExit,
  ])

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

      function selectCurrent(): boolean {
        const selected = slashMatches[slashSelectedIndex] ?? slashMatches[0]
        if (!selected) {
          return false
        }
        const startIndex = slashContext.startIndex
        if (startIndex < 0) {
          return false
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

      if (key.name === 'down' && !hasModifier) {
        // Move down (no wrap)
        setSlashSelectedIndex((prev) =>
          Math.min(prev + 1, slashMatches.length - 1),
        )
        return true
      }

      if (key.name === 'up' && !hasModifier) {
        // Move up (no wrap)
        setSlashSelectedIndex((prev) => Math.max(prev - 1, 0))
        return true
      }

      if (key.name === 'tab' && key.shift && !hasModifier) {
        // Move up with wrap
        setSlashSelectedIndex(
          (prev) => (slashMatches.length + prev - 1) % slashMatches.length,
        )
        return true
      }

      if (key.name === 'tab' && !key.shift && !hasModifier) {
        if (slashMatches.length > 1) {
          // Move up with wrap
          setSlashSelectedIndex((prev) => (prev + 1) % slashMatches.length)
        } else {
          selectCurrent()
        }
        return true
      }

      if (key.name === 'return' && !key.shift && !hasModifier) {
        selectCurrent()
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

      function selectCurrent(): boolean {
        const selected = agentMatches[agentSelectedIndex] ?? agentMatches[0]
        if (!selected) {
          return false
        }
        const startIndex = mentionContext.startIndex
        if (startIndex < 0) {
          return false
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

      if (key.name === 'down' && !hasModifier) {
        // Move down (no wrap)
        setAgentSelectedIndex((prev) =>
          Math.min(prev + 1, agentMatches.length - 1),
        )
        return true
      }

      if (key.name === 'up' && !hasModifier) {
        // Move up (no wrap)
        setAgentSelectedIndex((prev) => Math.max(prev - 1, 0))
        return true
      }

      if (key.name === 'tab' && key.shift && !hasModifier) {
        // Move up with wrap
        setAgentSelectedIndex(
          (prev) => (agentMatches.length + prev - 1) % agentMatches.length,
        )
        return true
      }

      if (key.name === 'tab' && !key.shift && !hasModifier) {
        if (agentMatches.length > 1) {
          // Move down with wrap
          setAgentSelectedIndex((prev) => (prev + 1) % agentMatches.length)
        } else {
          selectCurrent()
        }
        return true
      }

      if (key.name === 'return' && !key.shift && !hasModifier) {
        selectCurrent()
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
    setCursorPosition,
  )

  const sendMessageRef = useRef<SendMessageFn>()

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
    (content: string) =>
      sendMessageRef.current?.({ content, agentMode }) ?? Promise.resolve(),
    isChainInProgressRef,
    activeAgentStreamsRef,
  )

  const handleTimerEvent = useCallback(
    (event: SendMessageTimerEvent) => {
      const payload = {
        event: 'cli_main_agent_timer',
        timerEventType: event.type,
        agentId: agentId ?? 'main',
        messageId: event.messageId,
        startedAt: event.startedAt,
        ...(event.type === 'stop'
          ? {
              finishedAt: event.finishedAt,
              elapsedMs: event.elapsedMs,
              outcome: event.outcome,
            }
          : {}),
      }
      const message =
        event.type === 'start'
          ? 'Main agent timer started'
          : `Main agent timer stopped (${event.outcome})`
    },
    [agentId],
  )

  const { sendMessage, clearMessages } = useSendMessage({
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
    onBeforeMessageSend: validateAgents,
    mainAgentTimer,
    scrollToLatest,
    availableWidth: separatorWidth,
    onTimerEvent: handleTimerEvent,
    setHasReceivedPlanResponse,
  })

  sendMessageRef.current = sendMessage

  const { inputWidth, handleBuildFast, handleBuildMax } = useChatInput({
    inputValue,
    setInputValue,
    agentMode,
    setAgentMode,
    separatorWidth,
    initialPrompt,
    sendMessageRef,
  })

  // Status is active when waiting for response or streaming
  const isStatusActive = isWaitingForResponse || isStreaming
  const hasStatus = useHasStatus(
    isStatusActive,
    clipboardMessage,
    mainAgentTimer,
  )

  const handleSubmit = useCallback(
    () =>
      routeUserPrompt({
        abortControllerRef,
        agentMode,
        inputRef,
        inputValue,
        isChainInProgressRef,
        isStreaming,
        logoutMutation,
        streamMessageIdRef,
        addToQueue,
        clearMessages,
        handleCtrlC,
        saveToHistory,
        scrollToLatest,
        sendMessage,
        setCanProcessQueue,
        setInputFocused,
        setInputValue,
        setIsAuthenticated,
        setMessages,
        setUser,
        stopStreaming,
      }),
    [
      agentMode,
      inputValue,
      isStreaming,
      sendMessage,
      saveToHistory,
      addToQueue,
      streamMessageIdRef,
      isChainInProgressRef,
      scrollToLatest,
      handleCtrlC,
    ],
  )

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
    toggleAgentMode,
    onCtrlC: handleCtrlC,
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
    availableWidth: separatorWidth,
    theme,
    markdownPalette,
    collapsedAgents,
    streamingAgents,
    isWaitingForResponse,
    timer: mainAgentTimer,
    setCollapsedAgents,
    setFocusedAgentId,
  })

  const virtualizationNotice =
    shouldVirtualize && hiddenTopLevelCount > 0 ? (
      <text
        key="virtualization-notice"
        style={{ width: '100%', wrapMode: 'none' }}
      >
        <span fg={theme.secondary}>
          Showing latest {virtualTopLevelMessages.length} of{' '}
          {topLevelMessages.length} messages. Scroll up to load more.
        </span>
      </text>
    ) : null

  const shouldShowQueuePreview = queuedMessages.length > 0
  const shouldShowStatusLine = Boolean(
    exitWarning || hasStatus || shouldShowQueuePreview,
  )

  const statusIndicatorNode = (
    <StatusIndicator
      clipboardMessage={clipboardMessage}
      isActive={isStatusActive}
      timer={mainAgentTimer}
    />
  )

  const validationBanner = useValidationBanner({
    liveValidationErrors,
    loadedAgentsData,
    theme,
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
          backgroundColor: 'transparent',
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
              backgroundColor: 'transparent',
            },
            wrapperOptions: {
              flexGrow: 1,
              border: false,
              shouldFill: true,
              backgroundColor: 'transparent',
            },
            contentOptions: {
              flexDirection: 'column',
              gap: 0,
              shouldFill: true,
              justifyContent: 'flex-end',
              backgroundColor: 'transparent',
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
          backgroundColor: 'transparent',
        }}
      >
        {shouldShowStatusLine && (
          <box
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <text style={{ wrapMode: 'none' }}>
              {hasStatus && statusIndicatorNode}
              {hasStatus && (exitWarning || shouldShowQueuePreview) && '  '}
              {exitWarning && <span fg={theme.secondary}>{exitWarning}</span>}
              {exitWarning && shouldShowQueuePreview && '  '}
              {shouldShowQueuePreview && (
                <span fg={theme.secondary} bg={theme.inputFocusedBg}>
                  {' '}
                  {formatQueuedPreview(
                    queuedMessages,
                    Math.max(30, terminalWidth - 25),
                  )}{' '}
                </span>
              )}
            </text>
          </box>
        )}
        <box
          style={{
            width: '100%',
            borderStyle: 'single',
            borderColor: theme.secondary,
            customBorderChars: BORDER_CHARS,
          }}
        >
          {agentMode === 'PLAN' && hasReceivedPlanResponse && (
            <BuildModeButtons
              theme={theme}
              onBuildFast={handleBuildFast}
              onBuildMax={handleBuildMax}
            />
          )}
          {slashContext.active && slashSuggestionItems.length > 0 ? (
            <SuggestionMenu
              items={slashSuggestionItems}
              selectedIndex={slashSelectedIndex}
              maxVisible={10}
              prefix="/"
            />
          ) : null}
          {!slashContext.active &&
          mentionContext.active &&
          agentSuggestionItems.length > 0 ? (
            <SuggestionMenu
              items={agentSuggestionItems}
              selectedIndex={agentSelectedIndex}
              maxVisible={10}
              prefix="@"
            />
          ) : null}
          <box
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <box style={{ flexGrow: 1, minWidth: 0 }}>
              <MultilineInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSubmit}
                placeholder="Type your coding task or '/' to see available commands"
                focused={inputFocused}
                maxHeight={5}
                width={inputWidth}
                onKeyIntercept={handleSuggestionMenuKey}
                textAttributes={theme.messageTextAttributes}
                ref={inputRef}
                cursorPosition={cursorPosition}
                setCursorPosition={setCursorPosition}
              />
            </box>
            <box
              style={{
                flexShrink: 0,
                paddingLeft: 2,
              }}
            >
              <AgentModeToggle
                mode={agentMode}
                onToggle={toggleAgentMode}
                onSelectMode={setAgentMode}
              />
            </box>
          </box>
        </box>
        {/* Agent status line - right-aligned under toggle */}
        {showAgentDisplayName && loadedAgentsData && (
          <box
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              paddingRight: 1,
              paddingTop: 0,
            }}
          >
            <text>
              <span fg={theme.muted}>Agent: {agentDisplayName}</span>
            </text>
          </box>
        )}
      </box>

      {/* Login Modal Overlay - show when not authenticated and done checking */}
      {validationBanner}

      {requireAuth !== null && isAuthenticated === false && (
        <LoginModal
          onLoginSuccess={handleLoginSuccess}
          hasInvalidCredentials={hasInvalidCredentials}
        />
      )}
    </box>
  )
}
