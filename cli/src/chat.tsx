import { TextAttributes } from '@opentui/core'
import { useRenderer, useTerminalDimensions } from '@opentui/react'
import os from 'os'
import path from 'path'
import React, {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import stringWidth from 'string-width'
import { useShallow } from 'zustand/react/shallow'

import { AgentModeToggle } from './components/agent-mode-toggle'
import { LoginModal } from './components/login-modal'
import { TerminalLink } from './components/terminal-link'
import {
  MultilineInput,
  type MultilineInputHandle,
} from './components/multiline-input'
import { Separator } from './components/separator'
import { StatusIndicator, useHasStatus } from './components/status-indicator'
import { SuggestionMenu } from './components/suggestion-menu'
import { SLASH_COMMANDS } from './data/slash-commands'
import { useAgentValidation } from './hooks/use-agent-validation'
import { useAuthQuery, useLogoutMutation } from './hooks/use-auth-query'
import { useClipboard } from './hooks/use-clipboard'
import { useElapsedTime } from './hooks/use-elapsed-time'
import { useInputHistory } from './hooks/use-input-history'
import { useKeyboardHandlers } from './hooks/use-keyboard-handlers'
import { useLogo } from './hooks/use-logo'
import { useMessageQueue } from './hooks/use-message-queue'
import { useMessageRenderer } from './hooks/use-message-renderer'
import { useChatScrollbox } from './hooks/use-scroll-management'
import { useSendMessage } from './hooks/use-send-message'
import type { SendMessageTimerEvent } from './hooks/use-send-message'
import { useSuggestionEngine } from './hooks/use-suggestion-engine'
import { useSystemThemeDetector } from './hooks/use-system-theme-detector'
import { useChatStore } from './state/chat-store'
import { flushAnalytics } from './utils/analytics'
import { getUserCredentials } from './utils/auth'
import { createChatScrollAcceleration } from './utils/chat-scroll-accel'
import { formatQueuedPreview } from './utils/helpers'
import {
  loadLocalAgents,
  type LocalAgentInfo,
} from './utils/local-agent-registry'
import { logger } from './utils/logger'
import { buildMessageTree } from './utils/message-tree-utils'
import {
  chatThemes,
  createMarkdownPalette,
  type ChatTheme,
} from './utils/theme-system'
import { env } from '@codebuff/common/env'
import { clientEnvVars } from '@codebuff/common/env-schema'
import { openFileAtPath } from './utils/open-file'
import { formatValidationError } from './utils/validation-error-formatting'
import { createValidationErrorBlocks } from './utils/create-validation-error-blocks'
import { getCodebuffClient } from './utils/codebuff-client'

import type { User } from './utils/auth'
import type { ToolName } from '@codebuff/sdk'
import type { ScrollBoxRenderable } from '@opentui/core'

type ChatVariant = 'ai' | 'user' | 'agent' | 'error'

const MAX_VIRTUALIZED_TOP_LEVEL = 60
const VIRTUAL_OVERSCAN = 12

// LOGO_BLOCK moved to component to be reactive to terminal width changes

type AgentMessage = {
  agentName: string
  agentType: string
  responseCount: number
  subAgentCount?: number
}

export type ContentBlock =
  | {
      type: 'text'
      content: string
      marginTop?: number
      marginBottom?: number
    }
  | {
      type: 'html'
      marginTop?: number
      marginBottom?: number
      render: (context: { textColor: string; theme: ChatTheme }) => ReactNode
    }
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
  | {
      type: 'agent-list'
      id: string
      agents: Array<{ id: string; displayName: string }>
      agentsDir: string
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
  metadata?: Record<string, any>
}

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
  const renderer = useRenderer()
  const { width: measuredWidth } = useTerminalDimensions()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const inputRef = useRef<MultilineInputHandle | null>(null)
  const sanitizeDimension = (
    value: number | null | undefined,
  ): number | null => {
    if (typeof value !== 'number') return null
    if (!Number.isFinite(value) || value <= 0) return null
    return value
  }
  const resolvedTerminalWidth =
    sanitizeDimension(measuredWidth) ?? sanitizeDimension(renderer?.width) ?? 80
  const terminalWidth = resolvedTerminalWidth
  const separatorWidth = Math.max(1, Math.floor(terminalWidth) - 2)

  // Get formatted logo for display in chat messages
  const contentMaxWidth = Math.max(10, Math.min(terminalWidth - 4, 80))
  const { textBlock: logoBlock } = useLogo({ availableWidth: contentMaxWidth })

  const themeName = useSystemThemeDetector()
  const theme = chatThemes[themeName]
  const markdownPalette = useMemo(() => createMarkdownPalette(theme), [theme])

  // Set up agent validation (manual trigger)
  const { validationErrors: liveValidationErrors, validate: validateAgents } =
    useAgentValidation(validationErrors)

  const [exitWarning, setExitWarning] = useState<string | null>(null)
  const exitArmedRef = useRef(false)
  const exitWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const lastSigintTimeRef = useRef<number>(0)

  // Track authentication state using TanStack Query
  const authQuery = useAuthQuery()
  const logoutMutation = useLogoutMutation()

  const [isAuthenticated, setIsAuthenticated] = useState(requireAuth === false)
  const [user, setUser] = useState<User | null>(null)

  // Update authentication state when requireAuth changes
  useEffect(() => {
    if (requireAuth === null) {
      return
    }
    setIsAuthenticated(!requireAuth)
  }, [requireAuth])

  // Update authentication state based on query results
  useEffect(() => {
    if (authQuery.isSuccess && authQuery.data) {
      setIsAuthenticated(true)
      if (!user) {
        // Convert authQuery data to User format if needed
        const userCredentials = getUserCredentials()
        const userData: User = {
          id: authQuery.data.id,
          name: userCredentials?.name || '',
          email: authQuery.data.email || '',
          authToken: userCredentials?.authToken || '',
        }
        setUser(userData)
      }
    } else if (authQuery.isError) {
      setIsAuthenticated(false)
      setUser(null)
    }
  }, [authQuery.isSuccess, authQuery.isError, authQuery.data, user])

  // Update logo when terminal width changes
  useEffect(() => {
    if (messages.length > 0) {
      const systemMessage = messages.find((m) =>
        m.id.startsWith('system-loaded-agents-'),
      )
      if (systemMessage?.blocks) {
        const logoBlockIndex = systemMessage.blocks.findIndex(
          (b) => b.type === 'text' && b.content.includes('█'),
        )
        if (logoBlockIndex !== -1) {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === systemMessage.id) {
                const newBlocks = [...msg.blocks!]
                newBlocks[logoBlockIndex] = {
                  type: 'text',
                  content: '\n\n' + logoBlock,
                }
                return { ...msg, blocks: newBlocks }
              }
              return msg
            }),
          )
        }
      }
    }
  }, [logoBlock])

  // Initialize with loaded agents message
  useEffect(() => {
    if (loadedAgentsData && messages.length === 0) {
      const agentListId = 'loaded-agents-list'
      const userCredentials = getUserCredentials()
      const greeting = userCredentials?.name?.trim().length
        ? `Welcome back, ${userCredentials.name.trim()}!`
        : null

      const blocks: ContentBlock[] = [
        {
          type: 'text',
          content: '\n\n' + logoBlock,
        },
      ]

      if (greeting) {
        blocks.push({
          type: 'text',
          content: greeting,
        })
      }

      // Log all client environment variables (works with both dev and binary modes)
      // In binary mode, env vars are embedded via --define and accessible through the env object
      // In dev mode, they come from process.env via Infisical
      const envVarsList = clientEnvVars
        .map((key) => {
          const value = env[key]
          // Truncate long values for display
          const displayValue =
            typeof value === 'string' && value.length > 50
              ? value.substring(0, 47) + '...'
              : value
          return `  ${key}=${displayValue}`
        })
        .join('\n')

      blocks.push({
        type: 'text',
        content: `\nCLI Environment variables:\n${envVarsList}`,
        marginTop: 1,
      })

      // [TEST] Display SDK environment variables
      const client = getCodebuffClient()
      if (client) {
        const sdkEnv = client.getEnvironmentInfo()
        const sdkEnvLines = [
          'Raw SDK env vars:',
          ...Object.entries(sdkEnv.rawEnv).map(
            ([key, value]) => `  ${key}=${value}`,
          ),
          '',
          'Computed SDK constants:',
          ...Object.entries(sdkEnv.computed).map(([key, value]) => {
            const displayValue =
              typeof value === 'string' && value.length > 50
                ? value.substring(0, 47) + '...'
                : String(value)
            return `  ${key}=${displayValue}`
          }),
        ].join('\n')

        blocks.push({
          type: 'text',
          content: `\nSDK Environment:\n${sdkEnvLines}`,
          marginTop: 1,
        })
      }

      // Calculate path from home directory to repository root
      // agentsDir is typically in the root, so use its parent as the repository root
      const homeDir = os.homedir()
      const repoRoot = path.dirname(loadedAgentsData.agentsDir)
      const relativePath = path.relative(homeDir, repoRoot)
      const displayPath = relativePath.startsWith('..')
        ? repoRoot // If outside home dir, show absolute path
        : `~/${relativePath}`

      const renderRepoPathInfo = () => (
        <text wrap={true}>
          Codebuff can read and write files in{' '}
          <TerminalLink
            text={displayPath}
            color="#3b82f6"
            inline={true}
            underlineOnHover={true}
            onActivate={() => openFileAtPath(repoRoot)}
          />
          , and run terminal commands to help you build.
        </text>
      )

      blocks.push({
        type: 'html',
        render: renderRepoPathInfo,
      })

      blocks.push({
        type: 'agent-list',
        id: agentListId,
        agents: loadedAgentsData.agents,
        agentsDir: loadedAgentsData.agentsDir,
      })

      const agentDisplayId = agentId ?? 'base2-fast'
      const agentSectionHeader = agentId
        ? `**Active agent: ${agentId}**`
        : `**Active agent:** *fast default (base2-fast)*`

      blocks.push({
        type: 'text',
        content: agentSectionHeader,
        marginTop: 1,
        marginBottom: 0,
      })

      const initialMessage: ChatMessage = {
        id: `system-loaded-agents-${Date.now()}`,
        variant: 'ai',
        content: '', // Content is in the block
        blocks,
        timestamp: new Date().toISOString(),
      }

      // Set as collapsed by default
      setCollapsedAgents((prev) => new Set([...prev, agentListId]))

      const messagesToAdd: ChatMessage[] = [initialMessage]

      // Add validation error message if there are errors
      if (validationErrors.length > 0) {
        const errorBlocks = createValidationErrorBlocks({
          errors: validationErrors,
          loadedAgentsData,
          availableWidth: separatorWidth,
        })

        const validationErrorMessage: ChatMessage = {
          id: `validation-error-${Date.now()}`,
          variant: 'error',
          content: '',
          blocks: errorBlocks,
          timestamp: new Date().toISOString(),
        }

        messagesToAdd.push(validationErrorMessage)
      }

      setMessages(messagesToAdd)
    }
  }, [loadedAgentsData, validationErrors]) // Run when loadedAgentsData or validationErrors change

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
    agentMode,
    toggleAgentMode,
    resetChatStore,
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
      agentMode: store.agentMode,
      toggleAgentMode: store.toggleAgentMode,
      resetChatStore: store.reset,
    })),
  )

  // Handle successful login
  const handleLoginSuccess = useCallback(
    (loggedInUser: User) => {
      logger.info(
        {
          userName: loggedInUser.name,
          userEmail: loggedInUser.email,
          userId: loggedInUser.id,
        },
        '🎊 handleLoginSuccess called - updating UI state',
      )

      logger.info('🔄 Resetting chat store...')
      resetChatStore()
      logger.info('✅ Chat store reset')

      logger.info('🎯 Setting input focused...')
      setInputFocused(true)
      logger.info('✅ Input focused')

      logger.info('👤 Setting user state...')
      setUser(loggedInUser)
      logger.info('✅ User state set')

      logger.info('🔓 Setting isAuthenticated to true...')
      setIsAuthenticated(true)
      logger.info('✅ isAuthenticated set to true - modal should close now')

      logger.info(
        { user: loggedInUser.name },
        '🎉 Login flow completed successfully!',
      )
    },
    [resetChatStore, setInputFocused],
  )

  useEffect(() => {
    if (!isAuthenticated) return

    setInputFocused(true)

    const focusNow = () => {
      const handle = inputRef.current
      if (handle && typeof handle.focus === 'function') {
        handle.focus()
      }
    }

    focusNow()
    const timeoutId = setTimeout(focusNow, 0)

    return () => clearTimeout(timeoutId)
  }, [isAuthenticated, setInputFocused])

  const agentToggleLabel = agentMode === 'FAST' ? 'FAST' : '💪 MAX'
  const agentTogglePadding = agentMode === 'FAST' ? 4 : 2 // paddingLeft + paddingRight inside the button
  const agentToggleGap = 2 // paddingLeft on the container box next to the input
  const estimatedToggleWidth =
    agentTogglePadding + agentToggleGap + stringWidth(agentToggleLabel)
  const inputWidth = Math.max(1, separatorWidth - estimatedToggleWidth)

  const activeAgentStreamsRef = useRef<number>(0)
  const isChainInProgressRef = useRef<boolean>(isChainInProgress)

  const { clipboardMessage } = useClipboard()

  // Track main agent streaming elapsed time
  const mainAgentTimer = useElapsedTime()

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

  useEffect(() => {
    if (exitArmedRef.current && inputValue.length > 0) {
      exitArmedRef.current = false
      setExitWarning(null)
    }
  }, [inputValue])

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

  const handleCtrlC = useCallback(() => {
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

    return true
  }, [setExitWarning])

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
    useRef<
      (content: string, params: { agentMode: 'FAST' | 'MAX' }) => Promise<void>
    >()

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
      sendMessageRef.current?.(content, { agentMode }) ?? Promise.resolve(),
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
      logger.info(payload, message)
    },
    [agentId],
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
    onBeforeMessageSend: validateAgents,
    mainAgentTimer,
    scrollToLatest,
    availableWidth: separatorWidth,
    onTimerEvent: handleTimerEvent,
  })

  sendMessageRef.current = sendMessage

  useEffect(() => {
    if (initialPrompt && !hasAutoSubmittedRef.current) {
      hasAutoSubmittedRef.current = true

      const timeout = setTimeout(() => {
        logger.info({ prompt: initialPrompt }, 'Auto-submitting initial prompt')
        if (sendMessageRef.current) {
          sendMessageRef.current(initialPrompt, { agentMode })
        }
      }, 100)

      return () => clearTimeout(timeout)
    }
    return undefined
  }, [initialPrompt, agentMode])

  // Status is active when waiting for response or streaming
  const isStatusActive = isWaitingForResponse || isStreaming
  const hasStatus = useHasStatus(
    isStatusActive,
    clipboardMessage,
    mainAgentTimer,
  )

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return

    const normalized = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
    const cmd = normalized.split(/\s+/)[0].toLowerCase()
    if (cmd === 'login' || cmd === 'signin') {
      const msg = {
        id: `sys-${Date.now()}`,
        variant: 'ai' as const,
        content: "You're already in the app. Use /logout to switch accounts.",
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, msg])
      setInputValue('')
      return
    }
    if (cmd === 'logout' || cmd === 'signout') {
      abortControllerRef.current?.abort()
      stopStreaming()
      setCanProcessQueue(false)

      logoutMutation.mutate(undefined, {
        onSettled: () => {
          const msg = {
            id: `sys-${Date.now()}`,
            variant: 'ai' as const,
            content: 'Logged out.',
            timestamp: new Date().toISOString(),
          }
          setMessages((prev) => [...prev, msg])
          setInputValue('')
          setTimeout(() => {
            setUser(null)
            setIsAuthenticated(false)
          }, 300)
        },
      })
      return
    }

    if (cmd === 'exit' || cmd === 'quit') {
      abortControllerRef.current?.abort()
      stopStreaming()
      setCanProcessQueue(false)
      setInputValue('')
      handleCtrlC()
      return
    }

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

    sendMessage(trimmed, { agentMode })

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
    handleCtrlC,
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

  const shouldShowQueuePreview = queuedMessages.length > 0
  const shouldShowStatusLine = Boolean(
    exitWarning || hasStatus || shouldShowQueuePreview,
  )

  const statusIndicatorNode = (
    <StatusIndicator
      theme={theme}
      clipboardMessage={clipboardMessage}
      isActive={isStatusActive}
      timer={mainAgentTimer}
    />
  )

  // Render validation banner
  const renderValidationBanner = () => {
    if (liveValidationErrors.length === 0) {
      return null
    }

    const MAX_VISIBLE_ERRORS = 5
    const errorCount = liveValidationErrors.length
    const visibleErrors = liveValidationErrors.slice(0, MAX_VISIBLE_ERRORS)
    const hasMoreErrors = errorCount > MAX_VISIBLE_ERRORS

    // Helper to normalize relative path
    const normalizeRelativePath = (filePath: string): string => {
      if (!loadedAgentsData) return filePath
      const relativeToAgentsDir = path.relative(
        loadedAgentsData.agentsDir,
        filePath,
      )
      const normalized = relativeToAgentsDir.replace(/\\/g, '/')
      return `.agents/${normalized}`
    }

    // Get agent info by ID
    const createAgentInfoEntry = (agent: any): [string, LocalAgentInfo] => [
      agent.id,
      agent as LocalAgentInfo,
    ]

    const agentInfoById = new Map<string, LocalAgentInfo>(
      (loadedAgentsData?.agents.map(createAgentInfoEntry) || []) as [
        string,
        LocalAgentInfo,
      ][],
    )

    const formatErrorLine = (
      error: { id: string; message: string },
      index: number,
    ): string => {
      const agentId = error.id.replace(/_\d+$/, '')
      const agentInfo = agentInfoById.get(agentId)
      const relativePath = agentInfo
        ? normalizeRelativePath(agentInfo.filePath)
        : null

      const { fieldName, message } = formatValidationError(error.message)
      const errorMsg = fieldName ? `${fieldName}: ${message}` : message
      const truncatedMsg =
        errorMsg.length > 68 ? errorMsg.substring(0, 65) + '...' : errorMsg

      let output = index === 0 ? '\n' : '\n\n'
      output += agentId
      if (relativePath) {
        output += ` (${relativePath})`
      }
      output += '\n  ' + truncatedMsg
      return output
    }

    return (
      <box
        style={{
          flexDirection: 'column',
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 1,
          paddingBottom: 1,
          backgroundColor: theme.panelBg,
          border: true,
          borderStyle: 'single',
          borderColor: '#FFA500',
        }}
      >
        {/* Header */}
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingBottom: 0,
          }}
        >
          <text wrap={false} style={{ fg: theme.messageAiText }}>
            {`⚠️  ${errorCount === 1 ? '1 agent has validation issues' : `${errorCount} agents have validation issues`}`}
            {hasMoreErrors &&
              ` (showing ${MAX_VISIBLE_ERRORS} of ${errorCount})`}
          </text>
        </box>

        {/* Error list - build as single text with newlines */}
        <text wrap style={{ fg: theme.messageAiText }}>
          {visibleErrors.map(formatErrorLine).join('')}
        </text>

        {/* Show count of additional errors */}
        {hasMoreErrors && (
          <box
            style={{
              flexDirection: 'row',
              paddingTop: 0,
            }}
          >
            <text wrap={false} style={{ fg: theme.statusSecondary }}>
              {`... and ${errorCount - MAX_VISIBLE_ERRORS} more`}
            </text>
          </box>
        )}
      </box>
    )
  }

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
        {shouldShowStatusLine && (
          <box
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <text wrap={false}>
              {hasStatus && statusIndicatorNode}
              {hasStatus && (exitWarning || shouldShowQueuePreview) && '  '}
              {exitWarning && (
                <span fg={theme.statusSecondary}>{exitWarning}</span>
              )}
              {exitWarning && shouldShowQueuePreview && '  '}
              {shouldShowQueuePreview && (
                <span fg={theme.statusSecondary} bg={theme.inputFocusedBg}>
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
        <Separator theme={theme} width={separatorWidth} />
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
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            width: '100%',
          }}
        >
          <box style={{ flexGrow: 1 }}>
            <MultilineInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSubmit}
              placeholder="Share your thoughts and press Enter…"
              focused={inputFocused}
              maxHeight={5}
              theme={theme}
              width={inputWidth}
              onKeyIntercept={handleSuggestionMenuKey}
              ref={inputRef}
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
              theme={theme}
              onToggle={toggleAgentMode}
            />
          </box>
        </box>
        <Separator theme={theme} width={separatorWidth} />
      </box>

      {/* Login Modal Overlay - show when not authenticated and done checking */}
      {requireAuth !== null && !isAuthenticated && (
        <LoginModal
          onLoginSuccess={handleLoginSuccess}
          theme={theme}
          hasInvalidCredentials={hasInvalidCredentials}
        />
      )}
    </box>
  )
}
