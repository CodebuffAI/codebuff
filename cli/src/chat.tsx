import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useKeyboard } from '@opentui/react'
import { useShallow } from 'zustand/react/shallow'

import { routeUserPrompt } from './commands/router'
import { AgentModeToggle } from './components/agent-mode-toggle'
import { MessageWithAgents } from './components/message-with-agents'
import { FeedbackContainer } from './components/feedback-container'
import { ChatScrollArea } from './components/chat-scroll-area'
import { ChatInputArea } from './components/chat-input-area'
import { useFeedbackStore } from './state/feedback-store'
import { useAuthStore } from './state/auth-store'
import { toggleCollapsedById, autoCollapseBlocks } from './utils/block-tree'
import {
  MultilineInput,
  type MultilineInputHandle,
} from './components/multiline-input'
import { getStatusIndicatorState } from './utils/status-indicator-state'
import { StatusBar } from './components/status-bar'
import { SuggestionMenu } from './components/suggestion-menu'
import { SLASH_COMMANDS } from './data/slash-commands'
import { useAgentValidation } from './hooks/use-agent-validation'
import { useChatInput } from './hooks/use-chat-input'
import { useClipboard } from './hooks/use-clipboard'
import { useConnectionStatus } from './hooks/use-connection-status'
import { useElapsedTime } from './hooks/use-elapsed-time'
import { useExitHandler } from './hooks/use-exit-handler'
import { useInputHistory } from './hooks/use-input-history'
import { useKeyboardHandlers } from './hooks/use-keyboard-handlers'
import { useMessageQueue } from './hooks/use-message-queue'
import { useMessageVirtualization } from './hooks/use-message-virtualization'
import { useChatScrollbox } from './hooks/use-scroll-management'
import { useSendMessage } from './hooks/use-send-message'
import { useSuggestionEngine } from './hooks/use-suggestion-engine'
import { useSuggestionMenuHandlers } from './hooks/use-suggestion-menu-handlers'
import { useTerminalDimensions } from './hooks/use-terminal-dimensions'
import { useTheme } from './hooks/use-theme'
import { useValidationBanner } from './hooks/use-validation-banner'
import { useQueueUi } from './hooks/use-queue-ui'
import { useQueueControls } from './hooks/use-queue-controls'
import { logger } from './utils/logger'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { useChatStore } from './state/chat-store'
import { createChatScrollAcceleration } from './utils/chat-scroll-accel'
import { loadLocalAgents } from './utils/local-agent-registry'
import { buildMessageTree } from './utils/message-tree-utils'
import { computeInputLayoutMetrics } from './utils/text-layout'
import { createMarkdownPalette } from './utils/theme-system'
import { BORDER_CHARS } from './utils/ui-constants'

import type { ChatMessage, ContentBlock } from './types/chat'
import type { SendMessageFn } from './types/contracts/send-message'
import type { User } from './utils/auth'
import type { FileTreeNode } from '@codebuff/common/util/file'
import type { ScrollBoxRenderable } from '@opentui/core'
import type { Dispatch, SetStateAction } from 'react'

export const Chat = ({
  headerContent,
  initialPrompt,
  agentId,
  loadedAgentsData,
  validationErrors,
  fileTree,
  continueChat,
  continueChatId,
  logout,
}: {
  headerContent: React.ReactNode
  initialPrompt: string | null
  agentId?: string
  loadedAgentsData: {
    agents: Array<{ id: string; displayName: string }>
    agentsDir: string
  } | null
  validationErrors: Array<{ id: string; message: string }>
  fileTree: FileTreeNode[]
  continueChat: boolean
  continueChatId?: string
  logout: () => Promise<void>
}) => {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const inputRef = useRef<MultilineInputHandle | null>(null)
  const [showScrollbar, setShowScrollbar] = useState(false)
  const hasShownScrollbarRef = useRef(false)
  const { setIsAuthenticated, setUser } = useAuthStore()

  const { separatorWidth, terminalWidth, terminalHeight } =
    useTerminalDimensions()

  const theme = useTheme()
  const markdownPalette = useMemo(() => createMarkdownPalette(theme), [theme])

  const { validate: validateAgents } = useAgentValidation(validationErrors)

  const {
    inputValue,
    cursorPosition,
    lastEditDueToNav,
    setInputValue,
    inputFocused,
    setInputFocused,
    slashSelectedIndex,
    setSlashSelectedIndex,
    agentSelectedIndex,
    setAgentSelectedIndex,
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
    setHasReceivedPlanResponse,
    lastMessageMode,
    setLastMessageMode,
    addSessionCredits,
    resetChatStore,
    sessionCreditsUsed,
    setRunState,
  } = useChatStore(
    useShallow((store) => ({
      inputValue: store.inputValue,
      cursorPosition: store.cursorPosition,
      lastEditDueToNav: store.lastEditDueToNav,
      setInputValue: store.setInputValue,
      inputFocused: store.inputFocused,
      setInputFocused: store.setInputFocused,
      slashSelectedIndex: store.slashSelectedIndex,
      setSlashSelectedIndex: store.setSlashSelectedIndex,
      agentSelectedIndex: store.agentSelectedIndex,
      setAgentSelectedIndex: store.setAgentSelectedIndex,
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
      lastMessageMode: store.lastMessageMode,
      setLastMessageMode: store.setLastMessageMode,
      addSessionCredits: store.addSessionCredits,
      resetChatStore: store.reset,
      sessionCreditsUsed: store.sessionCreditsUsed,
      setRunState: store.setRunState,
    })),
  )

  // Memoize toggle IDs extraction - only recompute when messages change
  const allToggleIds = useMemo(() => {
    const ids = new Set<string>()

    const extractFromBlocks = (blocks: ContentBlock[] | undefined) => {
      if (!blocks) return
      for (const block of blocks) {
        if (block.type === 'agent') {
          ids.add(block.agentId)
          extractFromBlocks(block.blocks)
        } else if (block.type === 'tool') {
          ids.add(block.toolCallId)
        }
      }
    }

    for (const message of messages) {
      extractFromBlocks(message.blocks)
    }

    return ids
  }, [messages])

  // Refs for tracking state across renders
  const activeAgentStreamsRef = useRef<number>(0)
  const isChainInProgressRef = useRef<boolean>(isChainInProgress)
  const activeSubagentsRef = useRef<Set<string>>(activeSubagents)
  const abortControllerRef = useRef<AbortController | null>(null)
  const sendMessageRef = useRef<SendMessageFn>()

  const { statusMessage } = useClipboard()
  const isConnected = useConnectionStatus()
  const mainAgentTimer = useElapsedTime()
  const timerStartTime = mainAgentTimer.startTime

  // Sync refs with state
  useEffect(() => {
    isChainInProgressRef.current = isChainInProgress
  }, [isChainInProgress])

  useEffect(() => {
    activeSubagentsRef.current = activeSubagents
  }, [activeSubagents])

  const isUserCollapsingRef = useRef<boolean>(false)

  const handleCollapseToggle = useCallback(
    (id: string) => {
      isUserCollapsingRef.current = true

      setMessages((prevMessages) => {
        return prevMessages.map((message) => {
          // Handle agent variant messages
          if (message.variant === 'agent' && message.id === id) {
            const wasCollapsed = message.metadata?.isCollapsed ?? false
            return {
              ...message,
              metadata: {
                ...message.metadata,
                isCollapsed: !wasCollapsed,
                userOpened: wasCollapsed,
              },
            }
          }

          if (!message.blocks) return message

          return {
            ...message,
            blocks: toggleCollapsedById(message.blocks, id),
          }
        })
      })

      setTimeout(() => {
        isUserCollapsingRef.current = false
      }, 0)
    },
    [setMessages],
  )

  const isUserCollapsing = useCallback(() => {
    return isUserCollapsingRef.current
  }, [])

  const { scrollToLatest, scrollboxProps, isAtBottom } = useChatScrollbox(
    scrollRef,
    messages,
    isUserCollapsing,
  )



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
    fileMatches,
    slashSuggestionItems,
    agentSuggestionItems,
    fileSuggestionItems,
  } = useSuggestionEngine({
    inputValue,
    slashCommands: SLASH_COMMANDS,
    localAgents,
    fileTree,
  })

  // Reset suggestion menu indexes when context changes
  useEffect(() => {
    if (!slashContext.active) {
      setSlashSelectedIndex(0)
      return
    }
    setSlashSelectedIndex(0)
  }, [slashContext.active, slashContext.query, setSlashSelectedIndex])

  useEffect(() => {
    if (slashMatches.length > 0 && slashSelectedIndex >= slashMatches.length) {
      setSlashSelectedIndex(slashMatches.length - 1)
    }
    if (slashMatches.length === 0 && slashSelectedIndex !== 0) {
      setSlashSelectedIndex(0)
    }
  }, [slashMatches.length, slashSelectedIndex, setSlashSelectedIndex])

  useEffect(() => {
    if (!mentionContext.active) {
      setAgentSelectedIndex(0)
      return
    }
    setAgentSelectedIndex(0)
  }, [mentionContext.active, mentionContext.query, setAgentSelectedIndex])

  useEffect(() => {
    const totalMatches = agentMatches.length + fileMatches.length
    if (totalMatches > 0 && agentSelectedIndex >= totalMatches) {
      setAgentSelectedIndex(totalMatches - 1)
    }
    if (totalMatches === 0 && agentSelectedIndex !== 0) {
      setAgentSelectedIndex(0)
    }
  }, [
    agentMatches.length,
    fileMatches.length,
    agentSelectedIndex,
    setAgentSelectedIndex,
  ])

  const { handleSuggestionMenuKey } = useSuggestionMenuHandlers({
    slashContext,
    mentionContext,
    slashMatches,
    agentMatches,
    fileMatches,
    slashSelectedIndex,
    agentSelectedIndex,
    inputValue,
    setInputValue,
    setSlashSelectedIndex,
    setAgentSelectedIndex,
  })

  const { saveToHistory, navigateUp, navigateDown } = useInputHistory(
    inputValue,
    setInputValue,
  )

  const {
    queuedMessages,
    streamStatus,
    queuePaused,
    streamMessageIdRef,
    addToQueue,
    startStreaming,
    stopStreaming,
    setStreamStatus,
    setCanProcessQueue,
    pauseQueue,
    resumeQueue,
    clearQueue,
    isQueuePausedRef,
  } = useMessageQueue(
    (content: string) =>
      sendMessageRef.current?.({ content, agentMode }) ?? Promise.resolve(),
    isChainInProgressRef,
    activeAgentStreamsRef,
  )

  const {
    queuedCount,
    shouldShowQueuePreview,
    queuePreviewTitle,
    pausedQueueText,
    inputPlaceholder,
  } = useQueueUi({
    queuePaused,
    queuedMessages,
    separatorWidth,
    terminalWidth,
  })

  const { handleCtrlC: baseHandleCtrlC, nextCtrlCWillExit } = useExitHandler({
    inputValue,
    setInputValue,
  })

  const { handleCtrlC, ensureQueueActiveBeforeSubmit } = useQueueControls({
    queuePaused,
    queuedCount,
    clearQueue,
    resumeQueue,
    inputHasText: Boolean(inputValue),
    baseHandleCtrlC,
  })

  // Derive boolean flags from streamStatus for convenience
  const isWaitingForResponse = streamStatus === 'waiting'
  const isStreaming = streamStatus !== 'idle'

  // Timer events are currently tracked but not used for UI updates
  // Future: Could be used for analytics or debugging

  const { sendMessage, clearMessages } = useSendMessage({
    messageState: {
      messages,
      allToggleIds,
      setMessages,
    },
    uiState: {
      setFocusedAgentId,
      setInputFocused,
      inputRef,
    },
    streamState: {
      setStreamingAgents,
      activeSubagentsRef,
      isChainInProgressRef,
      setActiveSubagents,
      setIsChainInProgress,
      setStreamStatus,
      startStreaming,
      stopStreaming,
      setCanProcessQueue,
      abortControllerRef,
      isQueuePausedRef,
      resumeQueue,
    },
    runConfig: {
      agentId,
      availableWidth: separatorWidth,
      scrollToLatest,
      onBeforeMessageSend: validateAgents,
    },
    timers: {
      mainAgentTimer,
      onTimerEvent: () => {}, // No-op for now
    },
    sessionState: {
      setHasReceivedPlanResponse,
      lastMessageMode,
      setLastMessageMode,
      addSessionCredits,
      setRunState,
    },
    continuation: {
      continueChat,
      continueChatId,
    },
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

  const {
    feedbackMode,
    feedbackMessageId,
    openFeedbackForMessage,
    closeFeedback,
    saveCurrentInput,
    restoreSavedInput,
  } = useFeedbackStore(
    useShallow((state) => ({
      feedbackMode: state.feedbackMode,
      feedbackMessageId: state.feedbackMessageId,
      openFeedbackForMessage: state.openFeedbackForMessage,
      closeFeedback: state.closeFeedback,
      saveCurrentInput: state.saveCurrentInput,
      restoreSavedInput: state.restoreSavedInput,
    })),
  )

  const inputValueRef = useRef(inputValue)
  const cursorPositionRef = useRef(cursorPosition)
  useEffect(() => {
    inputValueRef.current = inputValue
  }, [inputValue])
  useEffect(() => {
    cursorPositionRef.current = cursorPosition
  }, [cursorPosition])

  const handleOpenFeedbackForMessage = useCallback(
    (id: string | null) => {
      saveCurrentInput(inputValueRef.current, cursorPositionRef.current)
      openFeedbackForMessage(id)
    },
    [saveCurrentInput, openFeedbackForMessage],
  )

  const handleMessageFeedback = useCallback(
    (id: string) => {
      handleOpenFeedbackForMessage(id)
    },
    [handleOpenFeedbackForMessage],
  )

  const handleExitFeedback = useCallback(() => {
    const { value, cursor } = restoreSavedInput()
    setInputValue({
      text: value,
      cursorPosition: cursor,
      lastEditDueToNav: false,
    })
    setInputFocused(true)
  }, [restoreSavedInput, setInputValue, setInputFocused])

  const handleCloseFeedback = useCallback(() => {
    closeFeedback()
    handleExitFeedback()
  }, [closeFeedback, handleExitFeedback])

  const handleOpenFeedbackForLatestMessage = useCallback(() => {
    const latest = [...messages]
      .reverse()
      .find((m) => m.variant === 'ai' && m.isComplete)
    if (!latest) {
      return false
    }
    handleOpenFeedbackForMessage(latest.id)
    return true
  }, [messages, handleOpenFeedbackForMessage])

  const handleSubmit = useCallback(async () => {
    ensureQueueActiveBeforeSubmit()

    // Show scrollbar on first message
    if (!hasShownScrollbarRef.current) {
      hasShownScrollbarRef.current = true
      setShowScrollbar(true)
    }

    const result = await routeUserPrompt({
      abortControllerRef,
      agentMode,
      inputRef,
      inputValue,
      isChainInProgressRef,
      isStreaming,
      streamMessageIdRef,
      addToQueue,
      clearMessages,
      clearQueue,
      handleCtrlC,
      saveToHistory,
      scrollToLatest,
      sendMessage,
      setCanProcessQueue,
      setInputFocused,
      setInputValue,
      setMessages,
      stopStreaming,
      logout,
    })

    if (result?.openFeedbackMode) {
      saveCurrentInput('', 0)
      openFeedbackForMessage(null)
    }
  }, [
    abortControllerRef,
    agentMode,
    inputRef,
    inputValue,
    isChainInProgressRef,
    isStreaming,
    streamMessageIdRef,
    addToQueue,
    clearMessages,
    clearQueue,
    handleCtrlC,
    saveToHistory,
    scrollToLatest,
    sendMessage,
    setCanProcessQueue,
    setInputFocused,
    setInputValue,
    setMessages,
    stopStreaming,
    ensureQueueActiveBeforeSubmit,
    saveCurrentInput,
    openFeedbackForMessage,
    logout,
  ])

  const totalMentionMatches = agentMatches.length + fileMatches.length
  const historyNavUpEnabled =
    lastEditDueToNav ||
    (cursorPosition === 0 &&
      ((slashContext.active && slashSelectedIndex === 0) ||
        (mentionContext.active && agentSelectedIndex === 0) ||
        (!slashContext.active && !mentionContext.active)))
  const historyNavDownEnabled =
    lastEditDueToNav ||
    (cursorPosition === inputValue.length &&
      ((slashContext.active &&
        slashSelectedIndex === slashMatches.length - 1) ||
        (mentionContext.active &&
          agentSelectedIndex === totalMentionMatches - 1) ||
        (!slashContext.active && !mentionContext.active)))

  useKeyboardHandlers({
    isStreaming,
    isWaitingForResponse,
    abortControllerRef,
    focusedAgentId,
    setFocusedAgentId,
    setInputFocused,
    inputRef,
    navigateUp,
    navigateDown,
    toggleAgentMode,
    onCtrlC: handleCtrlC,
    onInterrupt: () => {
      if (queuedMessages.length > 0) {
        pauseQueue()
      }
    },
    historyNavUpEnabled,
    historyNavDownEnabled,
    disabled: feedbackMode,
  })

  const { tree: messageTree, topLevelMessages } = useMemo(
    () => buildMessageTree(messages),
    [messages],
  )

  const { shouldVirtualize, virtualTopLevelMessages, hiddenTopLevelCount } =
    useMessageVirtualization({
      topLevelMessages,
      isAtBottom,
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

  const hasSlashSuggestions =
    slashContext.active && slashSuggestionItems.length > 0
  const hasMentionSuggestions =
    !slashContext.active &&
    mentionContext.active &&
    (agentSuggestionItems.length > 0 || fileSuggestionItems.length > 0)
  const hasSuggestionMenu = hasSlashSuggestions || hasMentionSuggestions

  const inputLayoutMetrics = useMemo(() => {
    const text = inputValue ?? ''
    const layoutContent = text.length > 0 ? text : ' '
    const safeCursor = Math.max(
      0,
      Math.min(cursorPosition, layoutContent.length),
    )
    const cursorProbe =
      safeCursor >= layoutContent.length
        ? layoutContent
        : layoutContent.slice(0, safeCursor)
    const cols = Math.max(1, inputWidth - 4)
    return computeInputLayoutMetrics({
      layoutContent,
      cursorProbe,
      cols,
      maxHeight: Math.floor(terminalHeight / 2),
    })
  }, [inputValue, cursorPosition, inputWidth, terminalHeight])
  const isMultilineInput = inputLayoutMetrics.heightLines > 1
  const shouldCenterInputVertically = !hasSuggestionMenu && !isMultilineInput
  const statusIndicatorState = getStatusIndicatorState({
    statusMessage,
    streamStatus,
    nextCtrlCWillExit,
    isConnected,
  })
  const hasStatusIndicatorContent = statusIndicatorState.kind !== 'idle'
  const inputBoxTitle = useMemo(() => {
    const segments: string[] = []

    if (queuePreviewTitle) {
      segments.push(queuePreviewTitle)
    } else if (pausedQueueText) {
      segments.push(`⏸ ${pausedQueueText}`)
    }

    if (segments.length === 0) {
      return undefined
    }

    return ` ${segments.join('   ')} `
  }, [queuePreviewTitle, pausedQueueText])

  const shouldShowStatusLine =
    !feedbackMode &&
    (hasStatusIndicatorContent || shouldShowQueuePreview || !isAtBottom)

  // Ctrl+F to open feedback for latest completed AI message
  useKeyboard(
    useCallback(
      (key) => {
        // Don't handle if already in feedback mode
        if (feedbackMode) return

        if (key?.ctrl && key.name === 'f') {
          if (
            'preventDefault' in key &&
            typeof key.preventDefault === 'function'
          ) {
            key.preventDefault()
          }
          handleOpenFeedbackForLatestMessage()
        }
      },
      [handleOpenFeedbackForLatestMessage, feedbackMode],
    ),
  )
  const validationBanner = useValidationBanner({
    liveValidationErrors: validationErrors,
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
      <ChatScrollArea
        scrollRef={scrollRef}
        appliedScrollboxProps={appliedScrollboxProps}
        headerContent={headerContent}
        virtualizationNotice={virtualizationNotice}
        topLevelMessages={topLevelMessages}
        markdownPalette={markdownPalette}
        streamingAgents={streamingAgents}
        messageTree={messageTree}
        messages={messages}
        separatorWidth={separatorWidth}
        theme={theme}
        setFocusedAgentId={setFocusedAgentId}
        isWaitingForResponse={isWaitingForResponse}
        timerStartTime={timerStartTime}
        handleCollapseToggle={handleCollapseToggle}
        handleBuildFast={handleBuildFast}
        handleBuildMax={handleBuildMax}
        handleMessageFeedback={handleMessageFeedback}
        handleCloseFeedback={handleCloseFeedback}
      />

      <box
        style={{
          flexShrink: 0,
          backgroundColor: 'transparent',
        }}
      >
        {shouldShowStatusLine && (
          <StatusBar
            statusMessage={statusMessage}
            streamStatus={streamStatus}
            timerStartTime={timerStartTime}
            nextCtrlCWillExit={nextCtrlCWillExit}
            isConnected={isConnected}
            isAtBottom={isAtBottom}
            scrollToLatest={scrollToLatest}
          />
        )}

        {/* Wrap the input row in a single OpenTUI border so the toggle stays inside the flex layout.
            Non-actionable queue context is injected via the border title to keep the content
            area stable while still surfacing that information. */}
        {feedbackMode ? (
          <FeedbackContainer
            inputRef={inputRef}
            onExitFeedback={handleExitFeedback}
            width={separatorWidth}
          />
        ) : (
          <ChatInputArea
            theme={theme}
            separatorWidth={separatorWidth}
            terminalHeight={terminalHeight}
            hasSuggestionMenu={hasSuggestionMenu}
            hasSlashSuggestions={hasSlashSuggestions}
            hasMentionSuggestions={hasMentionSuggestions}
            slashSuggestionItems={slashSuggestionItems}
            agentSuggestionItems={agentSuggestionItems}
            fileSuggestionItems={fileSuggestionItems}
            slashSelectedIndex={slashSelectedIndex}
            agentSelectedIndex={agentSelectedIndex}
            inputValue={inputValue}
            setInputValue={setInputValue}
            handleSubmit={handleSubmit}
            inputPlaceholder={inputPlaceholder}
            inputFocused={inputFocused}
            feedbackMode={feedbackMode}
            inputWidth={inputWidth}
            handleSuggestionMenuKey={handleSuggestionMenuKey}
            cursorPosition={cursorPosition}
            agentMode={agentMode}
            toggleAgentMode={toggleAgentMode}
            setAgentMode={setAgentMode}
            shouldCenterInputVertically={shouldCenterInputVertically}
            inputBoxTitle={inputBoxTitle}
            inputRef={inputRef}
          />
        )}
      </box>

      {validationBanner}
    </box>
  )
}
