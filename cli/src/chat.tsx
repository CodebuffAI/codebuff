import { RECONNECTION_MESSAGE_DURATION_MS } from '@codebuff/sdk'
import open from 'open'
import { useQueryClient } from '@tanstack/react-query'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { useShallow } from 'zustand/react/shallow'

import { getAdsEnabled } from './commands/ads'
import { handleChatSelection } from './commands/chats'
import { routeUserPrompt, addBashMessageToHistory } from './commands/router'
import { AdBanner } from './components/ad-banner'
import { ChatInputBar } from './components/chat-input-bar'
import { ChatPickerScreen } from './components/chat-picker-screen'
import { BottomStatusLine } from './components/bottom-status-line'
import { areCreditsRestored } from './components/out-of-credits-banner'
import { LoadPreviousButton } from './components/load-previous-button'
import { MessageWithAgents } from './components/message-with-agents'
import { PendingBashMessage } from './components/pending-bash-message'
import { StatusBar } from './components/status-bar'
import { TopBanner } from './components/top-banner'
import { SLASH_COMMANDS } from './data/slash-commands'
import { useAgentValidation } from './hooks/use-agent-validation'
import { useAskUserBridge } from './hooks/use-ask-user-bridge'
import { authQueryKeys } from './hooks/use-auth-query'
import { useChatInput } from './hooks/use-chat-input'
import { useClaudeQuotaQuery } from './hooks/use-claude-quota-query'
import {
  useChatKeyboard,
  type ChatKeyboardHandlers,
} from './hooks/use-chat-keyboard'
import { useClipboard } from './hooks/use-clipboard'
import { useConnectionStatus } from './hooks/use-connection-status'
import { useElapsedTime } from './hooks/use-elapsed-time'
import { useGravityAd } from './hooks/use-gravity-ad'
import { useEvent } from './hooks/use-event'
import { useExitHandler } from './hooks/use-exit-handler'
import { useInputHistory } from './hooks/use-input-history'
import { useMessageQueue, type QueuedMessage } from './hooks/use-message-queue'
import { usePublishMutation } from './hooks/use-publish-mutation'
import { useQueueControls } from './hooks/use-queue-controls'
import { useQueueUi } from './hooks/use-queue-ui'
import { useChatScrollbox } from './hooks/use-scroll-management'
import { useSendMessage } from './hooks/use-send-message'
import { useSuggestionEngine } from './hooks/use-suggestion-engine'
import { useTerminalDimensions } from './hooks/use-terminal-dimensions'
import { useTerminalLayout } from './hooks/use-terminal-layout'
import { useTheme } from './hooks/use-theme'
import { useTimeout } from './hooks/use-timeout'
import { useUsageMonitor } from './hooks/use-usage-monitor'
import { WEBSITE_URL } from './login/constants'
import { getProjectRoot } from './project-files'
import { useChatStore } from './state/chat-store'
import { useFeedbackStore } from './state/feedback-store'
import { usePublishStore } from './state/publish-store'
import {
  addClipboardPlaceholder,
  addPendingImageFromFile,
  validateAndAddImage,
} from './utils/add-pending-image'
import { createChatScrollAcceleration } from './utils/chat-scroll-accel'
import { showClipboardMessage } from './utils/clipboard'
import { readClipboardImage } from './utils/clipboard-image'
import { getInputModeConfig } from './utils/input-modes'
import {
  type ChatKeyboardState,
  createDefaultChatKeyboardState,
} from './utils/keyboard-actions'
import { loadLocalAgents } from './utils/local-agent-registry'
import { buildMessageTree } from './utils/message-tree-utils'
import {
  getStatusIndicatorState,
  type AuthStatus,
} from './utils/status-indicator-state'
import { getClaudeOAuthStatus } from './utils/claude-oauth'
import { createPasteHandler } from './utils/strings'
import { computeInputLayoutMetrics } from './utils/text-layout'
import { createMarkdownPalette } from './utils/theme-system'
import { reportActivity } from './utils/activity-tracker'

import type { CommandResult } from './commands/command-registry'
import type { MultilineInputHandle } from './components/multiline-input'
import type { ContentBlock } from './types/chat'
import type { SendMessageFn } from './types/contracts/send-message'
import type { User } from './utils/auth'
import type { AgentMode } from './utils/constants'
import type { FileTreeNode } from '@codebuff/common/util/file'
import type { ScrollBoxRenderable } from '@opentui/core'
import type { UseMutationResult } from '@tanstack/react-query'
import type { Dispatch, SetStateAction } from 'react'

export const Chat = ({
  headerContent,
  initialPrompt,
  agentId,
  fileTree,
  inputRef,
  setIsAuthenticated,
  setUser,
  logoutMutation,
  continueChat,
  continueChatId,
  authStatus,
  initialMode,
  gitRoot,
  onSwitchToGitRoot,
}: {
  headerContent: React.ReactNode
  initialPrompt: string | null
  agentId?: string
  fileTree: FileTreeNode[]
  inputRef: React.MutableRefObject<MultilineInputHandle | null>
  setIsAuthenticated: Dispatch<SetStateAction<boolean | null>>
  setUser: Dispatch<SetStateAction<User | null>>
  logoutMutation: UseMutationResult<boolean, Error, void, unknown>
  continueChat: boolean
  continueChatId?: string
  authStatus: AuthStatus
  initialMode?: AgentMode
  gitRoot?: string | null
  onSwitchToGitRoot?: () => void
}) => {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [hasOverflow, setHasOverflow] = useState(false)
  const hasOverflowRef = useRef(false)

  // Message pagination - show last N messages with "Load previous" button
  const MESSAGE_BATCH_SIZE = 15
  const [visibleMessageCount, setVisibleMessageCount] =
    useState(MESSAGE_BATCH_SIZE)

  const queryClient = useQueryClient()
  const [, startUiTransition] = useTransition()

  const [showReconnectionMessage, setShowReconnectionMessage] = useState(false)
  const reconnectionTimeout = useTimeout()
  const [forceFileOnlyMentions, setForceFileOnlyMentions] = useState(false)

  const { separatorWidth, terminalWidth, terminalHeight } =
    useTerminalDimensions()
  const { height: heightLayout, width: widthLayout } = useTerminalLayout()
  const isCompactHeight = heightLayout.is('xs')
  const isNarrowWidth = widthLayout.is('xs')
  const messageAvailableWidth = separatorWidth

  const theme = useTheme()
  const markdownPalette = useMemo(() => createMarkdownPalette(theme), [theme])

  const { validate: validateAgents } = useAgentValidation()

  // Subscribe to ask_user bridge to trigger form display
  useAskUserBridge()

  // Monitor usage data and auto-show banner when thresholds are crossed
  useUsageMonitor()

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
    streamingAgents: rawStreamingAgents,
    focusedAgentId,
    setFocusedAgentId,
    messages,
    setMessages,
    activeSubagents,
    isChainInProgress,
    agentMode,
    setAgentMode,
    toggleAgentMode,
    isRetrying,
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
      focusedAgentId: store.focusedAgentId,
      setFocusedAgentId: store.setFocusedAgentId,
      messages: store.messages,
      setMessages: store.setMessages,
      activeSubagents: store.activeSubagents,
      isChainInProgress: store.isChainInProgress,
      agentMode: store.agentMode,
      setAgentMode: store.setAgentMode,
      toggleAgentMode: store.toggleAgentMode,
      isRetrying: store.isRetrying,
    })),
  )

  // Stabilize streamingAgents reference - only create new Set when content changes
  const streamingAgentsKey = useMemo(
    () => Array.from(rawStreamingAgents).sort().join(','),
    [rawStreamingAgents],
  )
  const streamingAgents = useMemo(
    () => rawStreamingAgents,
    [streamingAgentsKey],
  )
  const pendingBashMessages = useChatStore((state) => state.pendingBashMessages)
  const showChatPicker = useChatStore((state) => state.showChatPicker)
  const setShowChatPicker = useChatStore((state) => state.setShowChatPicker)

  // Refs for tracking state across renders
  const activeAgentStreamsRef = useRef<number>(0)
  const isChainInProgressRef = useRef<boolean>(isChainInProgress)
  const activeSubagentsRef = useRef<Set<string>>(activeSubagents)
  const abortControllerRef = useRef<AbortController | null>(null)
  const sendMessageRef = useRef<SendMessageFn>()

  const { statusMessage } = useClipboard()

  const handleReconnection = useCallback(
    (isInitialConnection: boolean) => {
      // Invalidate auth queries so we refetch with current credentials
      queryClient.invalidateQueries({ queryKey: authQueryKeys.all })

      startUiTransition(() => {
        if (!isInitialConnection) {
          setShowReconnectionMessage(true)
          reconnectionTimeout.setTimeout(
            'reconnection-message',
            () => {
              startUiTransition(() => {
                setShowReconnectionMessage(false)
              })
            },
            RECONNECTION_MESSAGE_DURATION_MS,
          )
        }
      })
    },
    [queryClient, reconnectionTimeout, startUiTransition],
  )

  const isConnected = useConnectionStatus(handleReconnection)
  const mainAgentTimer = useElapsedTime()
  const { ad } = useGravityAd()
  const timerStartTime = mainAgentTimer.startTime

  // Set initial mode from CLI flag on mount
  useEffect(() => {
    if (initialMode) {
      setAgentMode(initialMode)
    }
  }, [initialMode, setAgentMode])

  // Sync refs with state
  useEffect(() => {
    isChainInProgressRef.current = isChainInProgress
  }, [isChainInProgress])

  useEffect(() => {
    activeSubagentsRef.current = activeSubagents
  }, [activeSubagents])

  // Reset visible message count when messages are cleared or conversation changes
  useEffect(() => {
    if (messages.length <= MESSAGE_BATCH_SIZE) {
      setVisibleMessageCount(MESSAGE_BATCH_SIZE)
    }
  }, [messages.length])

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
              // Handle thinking blocks - just match by thinkingId
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

              // Recursively update nested blocks inside agent blocks
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

  const localAgents = useMemo(() => loadLocalAgents(agentMode), [agentMode])
  const inputMode = useChatStore((state) => state.inputMode)
  const setInputMode = useChatStore((state) => state.setInputMode)
  const askUserState = useChatStore((state) => state.askUserState)

  // Filter slash commands based on current ads state - only show the option that changes state
  const filteredSlashCommands = useMemo(() => {
    const adsEnabled = getAdsEnabled()
    return SLASH_COMMANDS.filter((cmd) => {
      if (cmd.id === 'ads:enable') return !adsEnabled
      if (cmd.id === 'ads:disable') return adsEnabled
      return true
    })
  }, [inputValue]) // Re-evaluate when input changes (user may have just toggled)

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
    disableAgentSuggestions: forceFileOnlyMentions || inputMode !== 'default',
    inputValue: inputMode === 'bash' ? '' : inputValue,
    cursorPosition,
    slashCommands: filteredSlashCommands,
    localAgents,
    fileTree,
    currentAgentMode: agentMode,
  })

  useEffect(() => {
    if (!mentionContext.active) {
      setForceFileOnlyMentions(false)
    }
  }, [mentionContext.active])

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

  const openFileMenuWithTab = useCallback(() => {
    const safeCursor = Math.max(0, Math.min(cursorPosition, inputValue.length))

    let wordStart = safeCursor
    while (wordStart > 0 && !/\s/.test(inputValue[wordStart - 1])) {
      wordStart--
    }

    const before = inputValue.slice(0, wordStart)
    const wordAtCursor = inputValue.slice(wordStart, safeCursor)
    const after = inputValue.slice(safeCursor)
    const mentionWord = wordAtCursor.startsWith('@')
      ? wordAtCursor
      : `@${wordAtCursor}`

    const text = `${before}${mentionWord}${after}`
    const nextCursor = before.length + mentionWord.length

    setInputValue({
      text,
      cursorPosition: nextCursor,
      lastEditDueToNav: false,
    })
    setForceFileOnlyMentions(true)
  }, [cursorPosition, inputValue, setInputValue])

  const { saveToHistory, navigateUp, navigateDown } = useInputHistory(
    inputValue,
    setInputValue,
    { inputMode, setInputMode },
  )

  const {
    queuedMessages,
    streamStatus,
    queuePaused,
    streamMessageIdRef,
    addToQueue,
    stopStreaming,
    setStreamStatus,
    setCanProcessQueue,
    pauseQueue,
    resumeQueue,
    clearQueue,
    isQueuePausedRef,
  } = useMessageQueue(
    (message: QueuedMessage) =>
      sendMessageRef.current?.({
        content: message.content,
        agentMode,
        images: message.images,
      }) ?? Promise.resolve(),
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

  // When streaming completes, flush any pending bash commands into history (ghost mode only)
  // Non-ghost mode commands are already in history and will be cleared when user sends next message
  useEffect(() => {
    if (
      !isStreaming &&
      !streamMessageIdRef.current &&
      !isChainInProgressRef.current &&
      pendingBashMessages.length > 0
    ) {
      // Only flush ghost mode commands (those not already added to history) to UI
      const ghostModeMessages = pendingBashMessages.filter(
        (msg) => !msg.isRunning && !msg.addedToHistory,
      )

      // Add ghost mode messages to UI history
      for (const msg of ghostModeMessages) {
        addBashMessageToHistory({
          command: msg.command,
          stdout: msg.stdout,
          stderr: msg.stderr ?? null,
          exitCode: msg.exitCode,
          cwd: msg.cwd || process.cwd(),
          setMessages,
        })
      }

      // Mark ghost mode messages as added to history (so they don't show as ghost UI)
      // but keep them in pendingBashMessages so they get sent to LLM with next user message
      if (ghostModeMessages.length > 0) {
        const ghostIds = new Set(ghostModeMessages.map((m) => m.id))
        useChatStore.setState((state) => ({
          pendingBashMessages: state.pendingBashMessages.map((m) =>
            ghostIds.has(m.id) ? { ...m, addedToHistory: true } : m,
          ),
        }))
      }
    }
  }, [isStreaming, pendingBashMessages, setMessages])

  // Timer events are currently tracked but not used for UI updates
  // Future: Could be used for analytics or debugging

  const { sendMessage, clearMessages } = useSendMessage({
    inputRef,
    activeSubagentsRef,
    isChainInProgressRef,
    setStreamStatus,
    setCanProcessQueue,
    abortControllerRef,
    agentId,
    onBeforeMessageSend: validateAgents,
    mainAgentTimer,
    scrollToLatest,
    onTimerEvent: () => {}, // No-op for now
    isQueuePausedRef,
    resumeQueue,
    continueChat,
    continueChatId,
  })

  sendMessageRef.current = sendMessage

  const onSubmitPrompt = useEvent(
    async (
      content: string,
      mode: AgentMode,
      options?: { preserveInputValue?: boolean },
    ) => {
      ensureQueueActiveBeforeSubmit()

      const preserveInput = options?.preserveInputValue === true
      const previousInputValue = preserveInput
        ? (() => {
            const {
              inputValue: text,
              cursorPosition,
              lastEditDueToNav,
            } = useChatStore.getState()
            return { text, cursorPosition, lastEditDueToNav }
          })()
        : null
      const preservedPendingImages =
        preserveInput && useChatStore.getState().pendingImages.length > 0
          ? [...useChatStore.getState().pendingImages]
          : null

      if (preserveInput && preservedPendingImages) {
        useChatStore.getState().clearPendingImages()
      }

      try {
        const result = await routeUserPrompt({
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

        return result
      } finally {
        if (previousInputValue) {
          setInputValue({
            text: previousInputValue.text,
            cursorPosition: previousInputValue.cursorPosition,
            lastEditDueToNav: previousInputValue.lastEditDueToNav,
          })
        }

        if (preserveInput && preservedPendingImages) {
          const currentPending = useChatStore.getState().pendingImages
          if (currentPending.length === 0) {
            useChatStore.setState((state) => {
              state.pendingImages = preservedPendingImages
            })
          }
        }
      }
    },
  )

  // Handle followup suggestion clicks
  useEffect(() => {
    const handleFollowupClick = (event: Event) => {
      const customEvent = event as CustomEvent<{
        prompt: string
        index: number
        toolCallId: string
      }>
      const { prompt, index, toolCallId } = customEvent.detail

      // Mark this followup as clicked (persisted per toolCallId)
      useChatStore.getState().markFollowupClicked(toolCallId, index)

      // Send the followup prompt directly, preserving the user's current input
      void onSubmitPrompt(prompt, agentMode, {
        preserveInputValue: true,
      })
    }

    globalThis.addEventListener('codebuff:send-followup', handleFollowupClick)
    return () => {
      globalThis.removeEventListener(
        'codebuff:send-followup',
        handleFollowupClick,
      )
    }
  }, [onSubmitPrompt, agentMode])

  // handleSlashItemClick is defined later after feedback/publish stores are available

  const handleMentionItemClick = useCallback(
    (index: number) => {
      if (mentionContext.startIndex < 0) return

      let replacement: string
      if (index < agentMatches.length) {
        const selected = agentMatches[index]
        if (!selected) return
        replacement = `@${selected.displayName} `
      } else {
        const fileIndex = index - agentMatches.length
        const selectedFile = fileMatches[fileIndex]
        if (!selectedFile) return
        replacement = `@${selectedFile.filePath} `
      }
      const before = inputValue.slice(0, mentionContext.startIndex)
      const after = inputValue.slice(
        mentionContext.startIndex + 1 + mentionContext.query.length,
      )
      setInputValue({
        text: before + replacement + after,
        cursorPosition: before.length + replacement.length,
        lastEditDueToNav: false,
      })
      setAgentSelectedIndex(0)
    },
    [
      mentionContext,
      agentMatches,
      fileMatches,
      inputValue,
      setInputValue,
      setAgentSelectedIndex,
    ],
  )

  const { inputWidth, handleBuildFast, handleBuildMax } = useChatInput({
    setInputValue,
    agentMode,
    setAgentMode,
    separatorWidth,
    initialPrompt,
    onSubmitPrompt,
    isCompactHeight,
    isNarrowWidth,
  })

  const {
    feedbackMode,
    openFeedbackForMessage,
    closeFeedback,
    saveCurrentInput,
    restoreSavedInput,
    setFeedbackText,
  } = useFeedbackStore(
    useShallow((state) => ({
      feedbackMode: state.feedbackMode,
      openFeedbackForMessage: state.openFeedbackForMessage,
      closeFeedback: state.closeFeedback,
      saveCurrentInput: state.saveCurrentInput,
      restoreSavedInput: state.restoreSavedInput,
      setFeedbackText: state.setFeedbackText,
    })),
  )

  const { publishMode, openPublishMode, closePublish, preSelectAgents } =
    usePublishStore(
      useShallow((state) => ({
        publishMode: state.publishMode,
        openPublishMode: state.openPublishMode,
        closePublish: state.closePublish,
        preSelectAgents: state.preSelectAgents,
      })),
    )

  const publishMutation = usePublishMutation()

  const handleCommandResult = useCallback(
    (result?: CommandResult) => {
      if (!result) return

      if (result.openFeedbackMode) {
        // Save the feedback text that was set by the command handler before opening feedback mode
        const { feedbackText, feedbackCursor } = useFeedbackStore.getState()
        saveCurrentInput('', 0)
        openFeedbackForMessage(null)
        // Restore the prefilled text after openFeedbackForMessage resets it
        if (feedbackText) {
          useFeedbackStore.getState().setFeedbackText(feedbackText)
          useFeedbackStore.getState().setFeedbackCursor(feedbackCursor)
        }
      }

      if (result.openPublishMode) {
        if (result.preSelectAgents && result.preSelectAgents.length > 0) {
          // preSelectAgents already sets publishMode: true, so don't call openPublishMode
          // which would reset the selectedAgentIds
          preSelectAgents(result.preSelectAgents)
        } else {
          openPublishMode()
        }
      }
    },
    [
      saveCurrentInput,
      openFeedbackForMessage,
      openPublishMode,
      preSelectAgents,
    ],
  )

  // Click handler for slash menu items - executes command immediately
  const handleSlashItemClick = useCallback(
    async (index: number) => {
      const selected = slashMatches[index]
      if (!selected) return

      // Execute the selected slash command immediately
      const commandString = `/${selected.id}`
      setSlashSelectedIndex(0)

      const result = await onSubmitPrompt(commandString, agentMode)
      handleCommandResult(result)
    },
    [
      slashMatches,
      setSlashSelectedIndex,
      onSubmitPrompt,
      agentMode,
      handleCommandResult,
    ],
  )

  const inputValueRef = useRef(inputValue)
  const cursorPositionRef = useRef(cursorPosition)
  useEffect(() => {
    inputValueRef.current = inputValue
  }, [inputValue])

  // Report activity on input changes for ad rotation (debounced via separate effect)
  const lastReportedActivityRef = useRef<number>(0)
  useEffect(() => {
    const now = Date.now()
    // Throttle to max once per second to avoid excessive calls
    if (now - lastReportedActivityRef.current > 1000) {
      lastReportedActivityRef.current = now
      reportActivity()
    }
  }, [inputValue])
  useEffect(() => {
    cursorPositionRef.current = cursorPosition
  }, [cursorPosition])

  const handleOpenFeedbackForMessage = useCallback(
    (
      id: string | null,
      options?: {
        category?: string
        footerMessage?: string
        errors?: Array<{ id: string; message: string }>
      },
    ) => {
      saveCurrentInput(inputValueRef.current, cursorPositionRef.current)
      openFeedbackForMessage(id, options)
    },
    [saveCurrentInput, openFeedbackForMessage],
  )

  const handleMessageFeedback = useCallback(
    (
      id: string,
      options?: {
        category?: string
        footerMessage?: string
        errors?: Array<{ id: string; message: string }>
      },
    ) => {
      handleOpenFeedbackForMessage(id, options)
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

  const handleExitPublish = useCallback(() => {
    closePublish()
    setInputFocused(true)
  }, [closePublish, setInputFocused])

  const handlePublish = useCallback(
    async (agentIds: string[]) => {
      await publishMutation.mutateAsync(agentIds)
    },
    [publishMutation],
  )

  // Ensure bracketed paste events target the active chat input
  useEffect(() => {
    if (feedbackMode) {
      inputRef.current?.focus()
      return
    }
    if (!askUserState) {
      inputRef.current?.focus()
    }
  }, [feedbackMode, askUserState, inputRef])

  const handleSubmit = useCallback(async () => {
    // Report activity for ad rotation
    reportActivity()
    const result = await onSubmitPrompt(inputValue, agentMode)
    handleCommandResult(result)
  }, [onSubmitPrompt, inputValue, agentMode, handleCommandResult])

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

  // Build keyboard state from store values
  const chatKeyboardState: ChatKeyboardState = useMemo(
    () => ({
      ...createDefaultChatKeyboardState(),
      inputMode,
      inputValue,
      cursorPosition,
      isStreaming,
      isWaitingForResponse,
      feedbackMode,
      focusedAgentId,
      slashMenuActive: slashContext.active,
      mentionMenuActive: mentionContext.active,
      slashSelectedIndex,
      agentSelectedIndex,
      slashMatchesLength: slashMatches.length,
      totalMentionMatches: agentMatches.length + fileMatches.length,
      disableSlashSuggestions:
        getInputModeConfig(inputMode).disableSlashSuggestions,
      historyNavUpEnabled,
      historyNavDownEnabled,
      nextCtrlCWillExit,
      queuePaused,
      queuedCount,
    }),
    [
      inputMode,
      inputValue,
      cursorPosition,
      isStreaming,
      isWaitingForResponse,
      feedbackMode,
      focusedAgentId,
      slashContext.active,
      mentionContext.active,
      slashSelectedIndex,
      agentSelectedIndex,
      slashMatches.length,
      agentMatches.length,
      fileMatches.length,
      historyNavUpEnabled,
      historyNavDownEnabled,
      nextCtrlCWillExit,
      queuePaused,
      queuedCount,
    ],
  )

  // Keyboard handlers
  const chatKeyboardHandlers: ChatKeyboardHandlers = useMemo(
    () => ({
      onExitInputMode: () => setInputMode('default'),
      onExitFeedbackMode: handleCloseFeedback,
      onClearFeedbackInput: () => {
        setFeedbackText('')
        useFeedbackStore.getState().setFeedbackCursor(0)
        useFeedbackStore.getState().setFeedbackCategory('other')
      },
      onClearInput: () =>
        setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false }),
      onBackspaceExitMode: () => setInputMode('default'),
      onInterruptStream: () => {
        abortControllerRef.current?.abort()
        if (queuedMessages.length > 0) {
          pauseQueue()
        }
      },
      onSlashMenuDown: () => setSlashSelectedIndex((prev) => prev + 1),
      onSlashMenuUp: () => setSlashSelectedIndex((prev) => prev - 1),
      onSlashMenuTab: () => {
        // Do nothing if there's only one match - user needs to press Enter to select
        if (slashMatches.length <= 1) return
        setSlashSelectedIndex((prev) => (prev + 1) % slashMatches.length)
      },
      onSlashMenuShiftTab: () =>
        setSlashSelectedIndex(
          (prev) => (slashMatches.length + prev - 1) % slashMatches.length,
        ),
      onSlashMenuSelect: async () => {
        const selected = slashMatches[slashSelectedIndex] || slashMatches[0]
        if (!selected) return

        // Execute the selected slash command immediately
        const commandString = `/${selected.id}`
        setSlashSelectedIndex(0)

        const result = await onSubmitPrompt(commandString, agentMode)

        handleCommandResult(result)
      },
      onSlashMenuComplete: () => {
        // Complete the word without executing - same as clicking on the item
        const selected = slashMatches[slashSelectedIndex] || slashMatches[0]
        if (!selected || slashContext.startIndex < 0) return
        const before = inputValue.slice(0, slashContext.startIndex)
        const after = inputValue.slice(
          slashContext.startIndex + 1 + slashContext.query.length,
        )
        const replacement = `/${selected.id} `
        setInputValue({
          text: before + replacement + after,
          cursorPosition: before.length + replacement.length,
          lastEditDueToNav: false,
        })
        setSlashSelectedIndex(0)
      },
      onMentionMenuDown: () => setAgentSelectedIndex((prev) => prev + 1),
      onMentionMenuUp: () => setAgentSelectedIndex((prev) => prev - 1),
      onMentionMenuTab: () => {
        const totalMatches = agentMatches.length + fileMatches.length
        setAgentSelectedIndex((prev) => (prev + 1) % totalMatches)
      },
      onMentionMenuShiftTab: () => {
        const totalMatches = agentMatches.length + fileMatches.length
        setAgentSelectedIndex(
          (prev) => (totalMatches + prev - 1) % totalMatches,
        )
      },
      onMentionMenuSelect: () => {
        if (mentionContext.startIndex < 0) return

        const trySelectAtIndex = (index: number): boolean => {
          let replacement: string
          if (index < agentMatches.length) {
            const selected = agentMatches[index]
            if (!selected) return false
            replacement = `@${selected.displayName} `
          } else {
            const fileIndex = index - agentMatches.length
            const selectedFile = fileMatches[fileIndex]
            if (!selectedFile) return false
            replacement = `@${selectedFile.filePath} `
          }
          const before = inputValue.slice(0, mentionContext.startIndex)
          const after = inputValue.slice(
            mentionContext.startIndex + 1 + mentionContext.query.length,
          )
          setInputValue({
            text: before + replacement + after,
            cursorPosition: before.length + replacement.length,
            lastEditDueToNav: false,
          })
          setAgentSelectedIndex(0)
          return true
        }

        // Try current selection, fall back to first item
        trySelectAtIndex(agentSelectedIndex) || trySelectAtIndex(0)
      },
      onMentionMenuComplete: () => {
        // Complete the word without executing - same as select for mentions
        if (mentionContext.startIndex < 0) return

        let replacement: string
        const index = agentSelectedIndex
        if (index < agentMatches.length) {
          const selected = agentMatches[index] || agentMatches[0]
          if (!selected) return
          replacement = `@${selected.displayName} `
        } else {
          const fileIndex = index - agentMatches.length
          const selectedFile = fileMatches[fileIndex] || fileMatches[0]
          if (!selectedFile) return
          replacement = `@${selectedFile.filePath} `
        }
        const before = inputValue.slice(0, mentionContext.startIndex)
        const after = inputValue.slice(
          mentionContext.startIndex + 1 + mentionContext.query.length,
        )
        setInputValue({
          text: before + replacement + after,
          cursorPosition: before.length + replacement.length,
          lastEditDueToNav: false,
        })
        setAgentSelectedIndex(0)
      },
      onOpenFileMenuWithTab: () => {
        const safeCursor = Math.max(
          0,
          Math.min(cursorPosition, inputValue.length),
        )
        let wordStart = safeCursor
        while (wordStart > 0 && !/\s/.test(inputValue[wordStart - 1]!)) {
          wordStart--
        }
        if (wordStart < safeCursor) {
          openFileMenuWithTab()
          return true
        }
        return false
      },
      onHistoryUp: navigateUp,
      onHistoryDown: navigateDown,
      onToggleAgentMode: toggleAgentMode,
      onUnfocusAgent: () => {
        setFocusedAgentId(null)
        setInputFocused(true)
        inputRef.current?.focus()
      },
      onClearQueue: clearQueue,
      onExitAppWarning: () => handleCtrlC(),
      onExitApp: () => handleCtrlC(),
      onBashHistoryUp: navigateUp,
      onBashHistoryDown: navigateDown,
      onPasteImage: () => {
        const placeholderPath = addClipboardPlaceholder()

        // Process the image in the background
        setTimeout(() => {
          const result = readClipboardImage()
          if (!result.success || !result.imagePath) {
            useChatStore.getState().removePendingImage(placeholderPath)
            showClipboardMessage(result.error || 'Failed to paste image', {
              durationMs: 3000,
            })
            return
          }

          const cwd = getProjectRoot() ?? process.cwd()
          void addPendingImageFromFile(result.imagePath, cwd, placeholderPath)
        }, 0)
      },
      onPasteImagePath: (imagePath: string) => {
        const cwd = getProjectRoot() ?? process.cwd()
        void validateAndAddImage(imagePath, cwd)
      },
      onPasteText: (text: string) => {
        setInputValue((prev) => {
          const before = prev.text.slice(0, prev.cursorPosition)
          const after = prev.text.slice(prev.cursorPosition)
          return {
            text: before + text + after,
            cursorPosition: before.length + text.length,
            lastEditDueToNav: false,
          }
        })
      },
      onOpenBuyCredits: () => {
        // If credits have been restored, just return to default mode
        if (areCreditsRestored()) {
          setInputMode('default')
          return
        }
        // Otherwise open the buy credits page
        open(WEBSITE_URL + '/usage')
      },
    }),
    [
      setInputMode,
      handleCloseFeedback,
      setFeedbackText,
      setInputValue,
      abortControllerRef,
      queuedMessages.length,
      pauseQueue,
      setSlashSelectedIndex,
      slashMatches,
      slashSelectedIndex,
      onSubmitPrompt,
      agentMode,
      handleCommandResult,
      setAgentSelectedIndex,
      agentMatches,
      fileMatches,
      agentSelectedIndex,
      mentionContext,
      cursorPosition,
      openFileMenuWithTab,
      navigateUp,
      navigateDown,
      toggleAgentMode,
      setFocusedAgentId,
      setInputFocused,
      inputRef,
      handleCtrlC,
      clearQueue,
    ],
  )

  // Use the chat keyboard hook
  useChatKeyboard({
    state: chatKeyboardState,
    handlers: chatKeyboardHandlers,
    disabled: askUserState !== null,
  })

  const { tree: messageTree, topLevelMessages } = useMemo(
    () => buildMessageTree(messages),
    [messages],
  )

  // Compute visible messages slice (from the end)
  const visibleTopLevelMessages = useMemo(() => {
    if (topLevelMessages.length <= visibleMessageCount) {
      return topLevelMessages
    }
    return topLevelMessages.slice(-visibleMessageCount)
  }, [topLevelMessages, visibleMessageCount])

  const hiddenMessageCount =
    topLevelMessages.length - visibleTopLevelMessages.length

  const handleLoadPreviousMessages = useCallback(() => {
    setVisibleMessageCount((prev) => prev + MESSAGE_BATCH_SIZE)
  }, [])

  const modeConfig = getInputModeConfig(inputMode)
  const hasSlashSuggestions =
    slashContext.active &&
    slashSuggestionItems.length > 0 &&
    !modeConfig.disableSlashSuggestions
  const hasMentionSuggestions =
    !slashContext.active &&
    mentionContext.active &&
    (agentSuggestionItems.length > 0 || fileSuggestionItems.length > 0)
  const hasSuggestionMenu = hasSlashSuggestions || hasMentionSuggestions

  const inputLayoutMetrics = useMemo(() => {
    // In bash mode, layout is based on the actual input (no ! prefix needed)
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
    const cols = Math.max(1, inputWidth)
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
    authStatus,
    showReconnectionMessage,
    isRetrying,
    isAskUserActive: askUserState !== null,
  })
  const hasStatusIndicatorContent = statusIndicatorState.kind !== 'idle'

  const isClaudeOAuthActive = getClaudeOAuthStatus().connected

  // Fetch Claude quota when OAuth is active
  const { data: claudeQuota } = useClaudeQuotaQuery({
    enabled: isClaudeOAuthActive,
    refetchInterval: 60 * 1000, // Refetch every 60 seconds
  })

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

  // Determine if Claude is actively streaming/waiting
  const isClaudeActive = isStreaming || isWaitingForResponse

  // Track mouse movement for ad activity (throttled)
  const lastMouseActivityRef = useRef<number>(0)
  const handleMouseActivity = useCallback(() => {
    const now = Date.now()
    // Throttle to max once per second
    if (now - lastMouseActivityRef.current > 1000) {
      lastMouseActivityRef.current = now
      reportActivity()
    }
  }, [])

  // Show chat picker if active
  if (showChatPicker) {
    return (
      <ChatPickerScreen
        onSelectChat={async (chatId) => {
          await handleChatSelection(chatId, {
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
        }}
        onClose={() => setShowChatPicker(false)}
      />
    )
  }

  return (
    <box
      onMouseMove={handleMouseActivity}
      style={{
        flexDirection: 'column',
        gap: 0,
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
            paddingLeft: 1,
            paddingRight: 2,
          },
        }}
      >
        <TopBanner gitRoot={gitRoot} onSwitchToGitRoot={onSwitchToGitRoot} />

        {headerContent}
        {hiddenMessageCount > 0 && (
          <LoadPreviousButton
            hiddenCount={hiddenMessageCount}
            onLoadMore={handleLoadPreviousMessages}
          />
        )}
        {visibleTopLevelMessages.map((message, idx) => {
          const isLast = idx === visibleTopLevelMessages.length - 1
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
              availableWidth={messageAvailableWidth}
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
        {/* Pending bash messages as ghost messages (only show those not already in history) */}
        {pendingBashMessages
          .filter((msg) => !msg.addedToHistory)
          .map((msg) => (
            <PendingBashMessage key={`pending-bash-${msg.id}`} message={msg} />
          ))}
      </scrollbox>

      <box
        style={{
          flexShrink: 0,
          backgroundColor: 'transparent',
        }}
      >
        {shouldShowStatusLine && (
          <StatusBar
            timerStartTime={timerStartTime}
            isAtBottom={isAtBottom}
            scrollToLatest={scrollToLatest}
            statusIndicatorState={statusIndicatorState}
          />
        )}

        {ad && getAdsEnabled() && <AdBanner ad={ad} />}

        <ChatInputBar
          inputValue={inputValue}
          cursorPosition={cursorPosition}
          setInputValue={setInputValue}
          inputFocused={inputFocused}
          inputRef={inputRef}
          inputPlaceholder={inputPlaceholder}
          lastEditDueToNav={lastEditDueToNav}
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
          onSlashItemClick={handleSlashItemClick}
          onMentionItemClick={handleMentionItemClick}
          theme={theme}
          terminalHeight={terminalHeight}
          separatorWidth={separatorWidth}
          shouldCenterInputVertically={shouldCenterInputVertically}
          inputBoxTitle={inputBoxTitle}
          isCompactHeight={isCompactHeight}
          isNarrowWidth={isNarrowWidth}
          feedbackMode={feedbackMode}
          handleExitFeedback={handleExitFeedback}
          publishMode={publishMode}
          handleExitPublish={handleExitPublish}
          handlePublish={handlePublish}
          handleSubmit={handleSubmit}
          onPaste={createPasteHandler({
            text: inputValue,
            cursorPosition,
            onChange: setInputValue,
            onPasteImage: chatKeyboardHandlers.onPasteImage,
            onPasteImagePath: chatKeyboardHandlers.onPasteImagePath,
            cwd: getProjectRoot() ?? process.cwd(),
          })}
        />

        <BottomStatusLine
          isClaudeConnected={isClaudeOAuthActive}
          isClaudeActive={isClaudeActive}
          claudeQuota={claudeQuota}
        />
      </box>
    </box>
  )
}
