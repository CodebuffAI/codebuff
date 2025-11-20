import { useKeyboard } from '@opentui/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { routeUserPrompt } from './commands/router'
import { AnnouncementBanner } from './components/announcement-banner'
import { ChatInputBar } from './components/chat-input-bar'
import { MessageWithAgents } from './components/message-with-agents'
import { StatusBar } from './components/status-bar'
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
import { useQueueControls } from './hooks/use-queue-controls'
import { useQueueUi } from './hooks/use-queue-ui'
import { useChatScrollbox } from './hooks/use-scroll-management'
import { useSendMessage } from './hooks/use-send-message'
import { useSuggestionEngine } from './hooks/use-suggestion-engine'
import { useSuggestionMenuHandlers } from './hooks/use-suggestion-menu-handlers'
import { useTerminalDimensions } from './hooks/use-terminal-dimensions'
import { useTheme } from './hooks/use-theme'
import { useValidationBanner } from './hooks/use-validation-banner'
import { useChatStore } from './state/chat-store'
import { useFeedbackStore } from './state/feedback-store'
import { createChatScrollAcceleration } from './utils/chat-scroll-accel'
import { loadLocalAgents } from './utils/local-agent-registry'
import { buildMessageTree } from './utils/message-tree-utils'
import { getStatusIndicatorState } from './utils/status-indicator-state'
import { computeInputLayoutMetrics } from './utils/text-layout'
import { createMarkdownPalette } from './utils/theme-system'

import type { MultilineInputHandle } from './components/multiline-input'
import type { ContentBlock } from './types/chat'
import type { SendMessageFn } from './types/contracts/send-message'
import type { User } from './utils/auth'
import type { FileTreeNode } from '@codebuff/common/util/file'
import type { ScrollBoxRenderable } from '@opentui/core'
import type { UseMutationResult } from '@tanstack/react-query'
import type { Dispatch, SetStateAction } from 'react'

export const Chat = ({
  headerContent,
  initialPrompt,
  agentId,
  loadedAgentsData,
  validationErrors,
  fileTree,
  inputRef,
  setIsAuthenticated,
  setUser,
  logoutMutation,
  continueChat,
  continueChatId,
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
  inputRef: React.MutableRefObject<MultilineInputHandle | null>
  setIsAuthenticated: Dispatch<SetStateAction<boolean | null>>
  setUser: Dispatch<SetStateAction<User | null>>
  logoutMutation: UseMutationResult<boolean, Error, void, unknown>
  continueChat: boolean
  continueChatId?: string
}) => {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [hasOverflow, setHasOverflow] = useState(false)
  const hasOverflowRef = useRef(false)

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
    isAnnouncementVisible,
    setIsAnnouncementVisible,
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
      isAnnouncementVisible: store.isAnnouncementVisible,
      setIsAnnouncementVisible: store.setIsAnnouncementVisible,
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
      // Set flag to prevent auto-scroll during user-initiated collapse
      isUserCollapsingRef.current = true

      // Find and toggle the block's isCollapsed property
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
                userOpened: wasCollapsed, // Mark as user-opened if expanding
              },
            }
          }

          // Handle blocks within messages
          if (!message.blocks) return message

          const updateBlocksRecursively = (
            blocks: ContentBlock[],
          ): ContentBlock[] => {
            let foundTarget = false
            const result = blocks.map((block) => {
              // Handle thinking blocks (grouped text blocks)
              if (block.type === 'text' && block.thinkingId === id) {
                foundTarget = true
                const wasCollapsed = block.isCollapsed ?? false
                return {
                  ...block,
                  isCollapsed: !wasCollapsed,
                  userOpened: wasCollapsed, // Mark as user-opened if expanding
                }
              }

              // Handle agent blocks
              if (block.type === 'agent' && block.agentId === id) {
                foundTarget = true
                const wasCollapsed = block.isCollapsed ?? false
                return {
                  ...block,
                  isCollapsed: !wasCollapsed,
                  userOpened: wasCollapsed, // Mark as user-opened if expanding
                }
              }

              // Handle tool blocks
              if (block.type === 'tool' && block.toolCallId === id) {
                foundTarget = true
                const wasCollapsed = block.isCollapsed ?? false
                return {
                  ...block,
                  isCollapsed: !wasCollapsed,
                  userOpened: wasCollapsed, // Mark as user-opened if expanding
                }
              }

              // Handle agent-list blocks
              if (block.type === 'agent-list' && block.id === id) {
                foundTarget = true
                const wasCollapsed = block.isCollapsed ?? false
                return {
                  ...block,
                  isCollapsed: !wasCollapsed,
                  userOpened: wasCollapsed, // Mark as user-opened if expanding
                }
              }

              // Recursively update nested blocks
              if (block.type === 'agent' && block.blocks) {
                const updatedBlocks = updateBlocksRecursively(block.blocks)
                // Only create new block if nested blocks actually changed
                if (updatedBlocks !== block.blocks) {
                  foundTarget = true
                  return {
                    ...block,
                    blocks: updatedBlocks,
                  }
                }
              }

              return block
            })

            // Return original array reference if nothing changed
            return foundTarget ? result : blocks
          }

          return {
            ...message,
            blocks: updateBlocksRecursively(message.blocks),
          }
        })
      })

      // Reset flag after state update completes
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

  // Check if content has overflowed and needs scrolling
  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox) return

    const checkOverflow = () => {
      const contentHeight = scrollbox.scrollHeight
      const viewportHeight = scrollbox.viewport.height
      const isOverflowing = contentHeight > viewportHeight

      // Only update state if overflow status actually changed
      if (hasOverflowRef.current !== isOverflowing) {
        hasOverflowRef.current = isOverflowing
        setHasOverflow(isOverflowing)
      }
    }

    // Check initially and whenever scroll state changes
    checkOverflow()
    scrollbox.verticalScrollBar.on('change', checkOverflow)

    return () => {
      scrollbox.verticalScrollBar.off('change', checkOverflow)
    }
  }, [])

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
    cursorPosition,
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
    messages,
    allToggleIds,
    setMessages,
    setFocusedAgentId,
    setInputFocused,
    inputRef,
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
    agentId,
    onBeforeMessageSend: validateAgents,
    mainAgentTimer,
    scrollToLatest,
    availableWidth: separatorWidth,
    onTimerEvent: () => {}, // No-op for now
    setHasReceivedPlanResponse,
    lastMessageMode,
    setLastMessageMode,
    addSessionCredits,
    setRunState,
    isQueuePausedRef,
    resumeQueue,
    continueChat,
    continueChatId,
  })

  sendMessageRef.current = sendMessage

  const { inputWidth, handleBuildFast, handleBuildMax } = useChatInput({
    inputValue,
    setInputValue,
    agentMode,
    setAgentMode,
    separatorWidth,
    initialPrompt,
    onSubmitPrompt: (content, mode) => {
      return routeUserPrompt({
        abortControllerRef,
        agentMode: mode,
        inputRef,
        inputValue: content,
        isChainInProgressRef,
        isStreaming,
        logoutMutation,
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
        setIsAuthenticated,
        setMessages,
        setUser,
        stopStreaming,
      })
    },
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

    const result = await routeUserPrompt({
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
      clearQueue,
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
    logoutMutation,
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
    setIsAuthenticated,
    setMessages,
    setUser,
    stopStreaming,
    ensureQueueActiveBeforeSubmit,
    saveCurrentInput,
    openFeedbackForMessage,
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
      <scrollbox
        ref={scrollRef}
        stickyScroll
        stickyStart="bottom"
        scrollX={false}
        scrollbarOptions={{ visible: false }}
        verticalScrollbarOptions={{
          visible: !isStreaming && !isWaitingForResponse && hasOverflow,
          trackOptions: { width: 1 },
        }}
        {...appliedScrollboxProps}
        style={{
          flexGrow: 1,
          rootOptions: {
            flexGrow: 1,
            padding: 0,
            gap: 0,
            flexDirection: 'row',
            shouldFill: true,
            backgroundColor: 'transparent',
          },
          wrapperOptions: {
            flexGrow: 1,
            border: false,
            shouldFill: true,
            backgroundColor: 'transparent',
            flexDirection: 'column',
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
        {isAnnouncementVisible && (
          <AnnouncementBanner onClose={() => setIsAnnouncementVisible(false)} />
        )}

        {headerContent}
        {virtualizationNotice}
        {topLevelMessages.map((message, idx) => {
          const isLast = idx === topLevelMessages.length - 1
          return (
            <MessageWithAgents
              key={message.id}
              message={message}
              depth={0}
              isLastMessage={isLast}
              theme={theme}
              markdownPalette={markdownPalette}
              streamingAgents={streamingAgents}
              messageTree={messageTree}
              messages={messages}
              availableWidth={separatorWidth}
              setFocusedAgentId={setFocusedAgentId}
              isWaitingForResponse={isWaitingForResponse}
              timerStartTime={timerStartTime}
              onToggleCollapsed={handleCollapseToggle}
              onBuildFast={handleBuildFast}
              onBuildMax={handleBuildMax}
              onFeedback={handleMessageFeedback}
              onCloseFeedback={handleCloseFeedback}
            />
          )
        })}
      </scrollbox>

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

        <ChatInputBar
          inputValue={inputValue}
          cursorPosition={cursorPosition}
          setInputValue={setInputValue}
          inputFocused={inputFocused}
          inputRef={inputRef}
          inputPlaceholder={inputPlaceholder}
          inputWidth={inputWidth}
          agentMode={agentMode}
          toggleAgentMode={toggleAgentMode}
          setAgentMode={setAgentMode}
          hasSlashSuggestions={hasSlashSuggestions}
          hasMentionSuggestions={hasMentionSuggestions}
          hasSuggestionMenu={hasSuggestionMenu}
          slashSuggestionItems={slashSuggestionItems}
          agentSuggestionItems={agentSuggestionItems}
          fileSuggestionItems={fileSuggestionItems}
          slashSelectedIndex={slashSelectedIndex}
          agentSelectedIndex={agentSelectedIndex}
          handleSuggestionMenuKey={handleSuggestionMenuKey}
          theme={theme}
          terminalHeight={terminalHeight}
          separatorWidth={separatorWidth}
          shouldCenterInputVertically={shouldCenterInputVertically}
          inputBoxTitle={inputBoxTitle}
          feedbackMode={feedbackMode}
          handleExitFeedback={handleExitFeedback}
          handleSubmit={handleSubmit}
        />
      </box>

      {validationBanner}
    </box>
  )
}
