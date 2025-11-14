import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { routeUserPrompt } from './commands/router'
import { AgentModeToggle } from './components/agent-mode-toggle'
import { Button } from './components/button'
import { LoginModal } from './components/login-modal'
import { MessageWithAgents } from './components/message-with-agents'
import {
  MultilineInput,
  type MultilineInputHandle,
} from './components/multiline-input'
import { getStatusIndicatorState } from './utils/status-indicator-state'
import { StatusBar } from './components/status-bar'
import { SuggestionMenu } from './components/suggestion-menu'
import { SLASH_COMMANDS } from './data/slash-commands'
import { useAgentValidation } from './hooks/use-agent-validation'
import { useAuthState } from './hooks/use-auth-state'
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
import { useChatStore } from './state/chat-store'
import { createChatScrollAcceleration } from './utils/chat-scroll-accel'
import { loadLocalAgents } from './utils/local-agent-registry'
import { buildMessageTree } from './utils/message-tree-utils'
import { computeInputLayoutMetrics } from './utils/text-layout'
import { createMarkdownPalette } from './utils/theme-system'
import { BORDER_CHARS } from './utils/ui-constants'

import type { ContentBlock } from './types/chat'
import type { SendMessageFn } from './types/contracts/send-message'
import type { FileTreeNode } from '@codebuff/common/util/file'
import type { ScrollBoxRenderable } from '@opentui/core'

export const Chat = ({
  headerContent,
  initialPrompt,
  agentId,
  requireAuth,
  hasInvalidCredentials,
  loadedAgentsData,
  validationErrors,
  fileTree,
}: {
  headerContent: React.ReactNode
  initialPrompt: string | null
  agentId?: string
  requireAuth: boolean | null
  hasInvalidCredentials: boolean
  loadedAgentsData: {
    agents: Array<{ id: string; displayName: string }>
    agentsDir: string
  } | null
  validationErrors: Array<{ id: string; message: string }>
  fileTree: FileTreeNode[]
}) => {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const inputRef = useRef<MultilineInputHandle | null>(null)

  const { separatorWidth, terminalWidth } = useTerminalDimensions()

  const theme = useTheme()
  const markdownPalette = useMemo(() => createMarkdownPalette(theme), [theme])

  const { validate: validateAgents } = useAgentValidation(validationErrors)

  // Track which agent toggles the user has manually opened.
  const [userOpenedAgents, setUserOpenedAgents] = useState<Set<string>>(
    new Set(),
  )

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
    collapsedAgents,
    setCollapsedAgents,
    autoCollapsedAgents,
    addAutoCollapsedAgent,
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
      collapsedAgents: store.collapsedAgents,
      setCollapsedAgents: store.setCollapsedAgents,
      autoCollapsedAgents: store.autoCollapsedAgents,
      addAutoCollapsedAgent: store.addAutoCollapsedAgent,
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

  const {
    isAuthenticated,
    setIsAuthenticated,
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

  // Refs for tracking state across renders
  const activeAgentStreamsRef = useRef<number>(0)
  const isChainInProgressRef = useRef<boolean>(isChainInProgress)
  const activeSubagentsRef = useRef<Set<string>>(activeSubagents)
  const abortControllerRef = useRef<AbortController | null>(null)
  const sendMessageRef = useRef<SendMessageFn>()

  const { clipboardMessage } = useClipboard()
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
      const wasCollapsed = collapsedAgents.has(id)

      // Set flag to prevent auto-scroll during user-initiated collapse
      isUserCollapsingRef.current = true
      setCollapsedAgents((prev) => {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      })

      // Reset flag after state update completes
      setTimeout(() => {
        isUserCollapsingRef.current = false
      }, 0)

      setUserOpenedAgents((prev) => {
        const next = new Set(prev)
        if (wasCollapsed) {
          next.add(id)
        } else {
          next.delete(id)
        }
        return next
      })
    },
    [collapsedAgents, setCollapsedAgents, setUserOpenedAgents],
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
    messages,
    allToggleIds,
    setMessages,
    setFocusedAgentId,
    setInputFocused,
    inputRef,
    setStreamingAgents,
    setCollapsedAgents,
    userOpenedAgents,
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
    isQueuePausedRef,
    resumeQueue,
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

  const handleSubmit = useCallback(() => {
    ensureQueueActiveBeforeSubmit()

    return routeUserPrompt({
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
    setCollapsedAgents,
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
      maxHeight: 5,
    })
  }, [inputValue, cursorPosition, inputWidth])
  const isMultilineInput = inputLayoutMetrics.heightLines > 1
  const shouldCenterInputVertically = !hasSuggestionMenu && !isMultilineInput
  const statusIndicatorState = getStatusIndicatorState({
    clipboardMessage,
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
    hasStatusIndicatorContent || shouldShowQueuePreview || !isAtBottom

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
              collapsedAgents={collapsedAgents}
              autoCollapsedAgents={autoCollapsedAgents}
              streamingAgents={streamingAgents}
              messageTree={messageTree}
              messages={messages}
              availableWidth={separatorWidth}
              setCollapsedAgents={setCollapsedAgents}
              addAutoCollapsedAgent={addAutoCollapsedAgent}
              setUserOpenedAgents={setUserOpenedAgents}
              setFocusedAgentId={setFocusedAgentId}
              isWaitingForResponse={isWaitingForResponse}
              timerStartTime={timerStartTime}
              onToggleCollapsed={handleCollapseToggle}
              onBuildFast={handleBuildFast}
              onBuildMax={handleBuildMax}
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
            clipboardMessage={clipboardMessage}
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
        <box
          title={inputBoxTitle}
          titleAlignment="center"
          style={{
            width: '100%',
            borderStyle: 'single',
            borderColor: theme.foreground,
            customBorderChars: BORDER_CHARS,
            paddingLeft: 1,
            paddingRight: 1,
            paddingTop: 0,
            paddingBottom: 0,
            flexDirection: 'column',
            gap: hasSuggestionMenu ? 1 : 0,
          }}
        >
          {hasSlashSuggestions ? (
            <SuggestionMenu
              items={slashSuggestionItems}
              selectedIndex={slashSelectedIndex}
              maxVisible={10}
              prefix="/"
            />
          ) : null}
          {hasMentionSuggestions ? (
            <SuggestionMenu
              items={[...agentSuggestionItems, ...fileSuggestionItems]}
              selectedIndex={agentSelectedIndex}
              maxVisible={10}
              prefix="@"
            />
          ) : null}
          <box
            style={{
              flexDirection: 'column',
              justifyContent: shouldCenterInputVertically
                ? 'center'
                : 'flex-start',
              minHeight: shouldCenterInputVertically ? 3 : undefined,
              gap: 0,
            }}
          >
            <box
              style={{
                flexDirection: 'row',
                alignItems: shouldCenterInputVertically
                  ? 'center'
                  : 'flex-start',
                width: '100%',
              }}
            >
              <box style={{ flexGrow: 1, minWidth: 0 }}>
                <MultilineInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={handleSubmit}
                  placeholder={inputPlaceholder}
                  focused={inputFocused}
                  maxHeight={5}
                  width={inputWidth}
                  onKeyIntercept={handleSuggestionMenuKey}
                  textAttributes={theme.messageTextAttributes}
                  ref={inputRef}
                  cursorPosition={cursorPosition}
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
        </box>
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
