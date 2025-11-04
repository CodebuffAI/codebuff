import os from 'os'
import path from 'path'

import { env } from '@codebuff/common/env'
import { clientEnvVars } from '@codebuff/common/env-schema'
import { useRenderer, useTerminalDimensions } from '@opentui/react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import stringWidth from 'string-width'
import { useShallow } from 'zustand/react/shallow'

import { routeUserPrompt } from './commands/router'
import { AgentModeToggle } from './components/agent-mode-toggle'
import { BuildModeButtons } from './components/build-mode-buttons'
import { LoginModal } from './components/login-modal'
import {
  MultilineInput,
  type MultilineInputHandle,
} from './components/multiline-input'
import { Separator } from './components/separator'
import { StatusIndicator, useHasStatus } from './components/status-indicator'
import { SuggestionMenu } from './components/suggestion-menu'
import { TerminalLink } from './components/terminal-link'
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
import { useSuggestionEngine } from './hooks/use-suggestion-engine'
import { useTheme, useResolvedThemeName } from './hooks/use-theme'
import { useChatStore } from './state/chat-store'
import { flushAnalytics } from './utils/analytics'
import { getUserCredentials } from './utils/auth'
import { createChatScrollAcceleration } from './utils/chat-scroll-accel'
import { getCodebuffClient } from './utils/codebuff-client'
import { createValidationErrorBlocks } from './utils/create-validation-error-blocks'
import { formatQueuedPreview } from './utils/helpers'
import {
  loadLocalAgents,
  type LocalAgentInfo,
} from './utils/local-agent-registry'
import { logger } from './utils/logger'
import { buildMessageTree } from './utils/message-tree-utils'
import { openFileAtPath } from './utils/open-file'
import { createMarkdownPalette } from './utils/theme-system'
import { formatValidationError } from './utils/validation-error-formatting'

import type { SendMessageTimerEvent } from './hooks/use-send-message'
import type { ChatMessage, ContentBlock } from './types/chat'
import type { SendMessageFn } from './types/contracts/send-message'
import type { User } from './utils/auth'
import type { ScrollBoxRenderable } from '@opentui/core'

const MAX_VIRTUALIZED_TOP_LEVEL = 60
const VIRTUAL_OVERSCAN = 12

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

  // Use theme hooks (transparent variant is default)
  const theme = useTheme()
  const resolvedThemeName = useResolvedThemeName()

  const markdownPalette = useMemo(() => createMarkdownPalette(theme), [theme])

  // Get formatted logo for display in chat messages
  const contentMaxWidth = Math.max(10, Math.min(terminalWidth - 4, 80))
  const { textBlock: logoBlock } = useLogo({ availableWidth: contentMaxWidth })

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

  // If requireAuth is null (checking), defer showing auth UI until resolved
  const initialAuthState =
    requireAuth === false ? true : requireAuth === true ? false : null
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(
    initialAuthState,
  )
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

  // Initialize and update loaded agents message when theme changes
  useEffect(() => {
    if (!loadedAgentsData) {
      return
    }

    const agentListId = 'loaded-agents-list'
    const userCredentials = getUserCredentials()
    const greeting = userCredentials?.name?.trim().length
      ? `Welcome back, ${userCredentials.name.trim()}!`
      : null

    const baseTextColor = theme.foreground

    const homeDir = os.homedir()
    const repoRoot = path.dirname(loadedAgentsData.agentsDir)
    const relativePath = path.relative(homeDir, repoRoot)
    const displayPath = relativePath.startsWith('..')
      ? repoRoot
      : `~/${relativePath}`

    const agentSectionHeader = agentId
      ? `**Active agent: ${agentId}**`
      : `**Active agent:** *fast default (base2-fast)*`

    const buildBlocks = (listId: string): ContentBlock[] => {
      const blocks: ContentBlock[] = [
        {
          type: 'text',
          content: '\n\n' + logoBlock,
          color: theme.foreground,
        },
      ]

      if (greeting) {
        blocks.push({
          type: 'text',
          content: greeting,
          color: baseTextColor,
        })
      }

      // Log all client environment variables (works with both dev and binary modes)
      const envVarsList = clientEnvVars
        .map((key) => {
          const value = env[key]
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
        color: baseTextColor,
      })

      // Display SDK environment variables when the client is available
      const client = getCodebuffClient()
      const envGetter = client ? (client as any)?.getEnvironmentInfo : null

      if (typeof envGetter === 'function') {
        const sdkEnv = envGetter.call(client) as {
          rawEnv: Record<string, string>
          computed: Record<string, unknown>
        }
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
          color: baseTextColor,
        })
      }

      blocks.push({
        type: 'html',
        render: () => (
          <text style={{ wrapMode: 'word' }}>
            <span fg={baseTextColor}>
              Codebuff can read and write files in{' '}
              <TerminalLink
                text={displayPath}
                inline={true}
                underlineOnHover={true}
                onActivate={() => openFileAtPath(repoRoot)}
              />
              , and run terminal commands to help you build.
            </span>
          </text>
        ),
      })

      blocks.push({
        type: 'agent-list',
        id: listId,
        agents: loadedAgentsData.agents,
        agentsDir: loadedAgentsData.agentsDir,
      })

      blocks.push({
        type: 'text',
        content: agentSectionHeader,
        marginTop: 1,
        marginBottom: 0,
        color: baseTextColor,
      })

      return blocks
    }

    if (messages.length === 0) {
      const initialBlocks = buildBlocks(agentListId)
      const initialMessage: ChatMessage = {
        id: `system-loaded-agents-${Date.now()}`,
        variant: 'ai',
        content: '',
        blocks: initialBlocks,
        timestamp: new Date().toISOString(),
      }

      setCollapsedAgents((prev) => new Set([...prev, agentListId]))

      const messagesToAdd: ChatMessage[] = [initialMessage]

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
      return
    }

    setMessages((prev) => {
      if (prev.length === 0) {
        return prev
      }

      const [firstMessage, ...rest] = prev
      if (!firstMessage.blocks) {
        return prev
      }

      const agentListBlock = firstMessage.blocks.find(
        (block): block is Extract<ContentBlock, { type: 'agent-list' }> =>
          block.type === 'agent-list',
      )

      if (!agentListBlock) {
        return prev
      }

      const updatedBlocks = buildBlocks(agentListBlock.id)

      return [
        {
          ...firstMessage,
          blocks: updatedBlocks,
        },
        ...rest,
      ]
    })
  }, [
    agentId,
    loadedAgentsData,
    logoBlock,
    resolvedThemeName,
    separatorWidth,
    theme,
    validationErrors,
  ])

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
    setAgentMode,
    toggleAgentMode,
    hasReceivedPlanResponse,
    setHasReceivedPlanResponse,
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
      setAgentMode: store.setAgentMode,
      toggleAgentMode: store.toggleAgentMode,
      hasReceivedPlanResponse: store.hasReceivedPlanResponse,
      setHasReceivedPlanResponse: store.setHasReceivedPlanResponse,
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
    if (isAuthenticated !== true) return

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

  const agentToggleLabel =
    agentMode === 'FAST' ? 'FAST' : agentMode === 'MAX' ? '💪 MAX' : '📋 PLAN'
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
      logger.info(payload, message)
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
  }, [initialPrompt, agentMode])

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

  const handleBuildFast = useCallback(() => {
    setAgentMode('FAST')
    setInputValue('Build it!')
    setTimeout(() => {
      if (sendMessageRef.current) {
        sendMessageRef.current({ content: 'Build it!', agentMode: 'FAST' })
      }
      setInputValue('')
    }, 0)
  }, [setAgentMode, setInputValue])

  const handleBuildMax = useCallback(() => {
    setAgentMode('MAX')
    setInputValue('Build it!')
    setTimeout(() => {
      if (sendMessageRef.current) {
        sendMessageRef.current({ content: 'Build it!', agentMode: 'MAX' })
      }
      setInputValue('')
    }, 0)
  }, [setAgentMode, setInputValue])

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

    const messageAiTextColor = theme.foreground
    const statusSecondaryColor = theme.secondary

    return (
      <box
        style={{
          flexDirection: 'column',
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 1,
          paddingBottom: 1,
          backgroundColor: theme.surface,
          border: true,
          borderStyle: 'single',
          borderColor: theme.warning,
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
          <text style={{ wrapMode: 'none', fg: messageAiTextColor }}>
            {`⚠️  ${errorCount === 1 ? '1 agent has validation issues' : `${errorCount} agents have validation issues`}`}
            {hasMoreErrors &&
              ` (showing ${MAX_VISIBLE_ERRORS} of ${errorCount})`}
          </text>
        </box>

        {/* Error list - build as single text with newlines */}
        <text style={{ wrapMode: 'word', fg: messageAiTextColor }}>
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
            <text style={{ wrapMode: 'none', fg: statusSecondaryColor }}>
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
        <Separator width={separatorWidth} />
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
              placeholder="Share your thoughts and press Enter…"
              focused={inputFocused}
              maxHeight={5}
              width={inputWidth}
              onKeyIntercept={handleSuggestionMenuKey}
              textAttributes={theme.messageTextAttributes}
              ref={inputRef}
            />
          </box>
          <box
            style={{
              flexShrink: 0,
              paddingLeft: 2,
            }}
          >
            <AgentModeToggle mode={agentMode} onToggle={toggleAgentMode} />
          </box>
        </box>
        <Separator width={separatorWidth} />
      </box>

      {/* Login Modal Overlay - show when not authenticated and done checking */}
      {requireAuth !== null && isAuthenticated === false && (
        <LoginModal
          onLoginSuccess={handleLoginSuccess}
          hasInvalidCredentials={hasInvalidCredentials}
        />
      )}
    </box>
  )
}
