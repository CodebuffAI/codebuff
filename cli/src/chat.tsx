import {
  InputRenderable,
  LayoutEvents,
  ScrollBoxRenderable,
  TextAttributes,
} from '@opentui/core'
import { render, useKeyboard, useRenderer } from '@opentui/react'
import { MultilineInput } from './multiline-input'
import {
  renderMarkdown,
  renderStreamingMarkdown,
  hasMarkdown,
  type MarkdownPalette,
} from './markdown-renderer'
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  getCodebuffClient,
  getToolDisplayInfo,
  formatToolOutput,
} from './codebuff-client'
import type { ToolName } from '@codebuff/sdk'

import { logger } from './logger'
import { ShimmerText } from './shimmer-text'

import { StatusIndicator, useHasStatus } from './status-indicator'
import React from 'react'

type ThemeName = 'dark' | 'light'

type ChatVariant = 'ai' | 'user' | 'agent'

type AgentMessage = {
  agentName: string
  agentType: string
  responseCount: number
  subAgentCount?: number
}

type ContentBlock =
  | { type: 'text'; content: string }
  | {
      type: 'tool'
      toolCallId: string
      toolName: ToolName
      input: any
      output?: string
    }

type ChatMessage = {
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

type MarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

interface MarkdownThemeOverrides {
  codeBackground?: string
  codeHeaderFg?: string
  inlineCodeFg?: string
  codeTextFg?: string
  headingFg?: Partial<Record<MarkdownHeadingLevel, string>>
  listBulletFg?: string
  blockquoteBorderFg?: string
  blockquoteTextFg?: string
  dividerFg?: string
  codeMonochrome?: boolean
}

export interface ChatTheme {
  background: string
  chromeBg: string
  chromeText: string
  accentBg: string
  accentText: string
  panelBg: string
  aiLine: string
  userLine: string
  timestampAi: string
  timestampUser: string
  messageAiText: string
  messageUserText: string
  messageBg: string
  statusAccent: string
  statusSecondary: string
  inputBg: string
  inputFg: string
  inputFocusedBg: string
  inputFocusedFg: string
  inputPlaceholder: string
  cursor: string
  agentPrefix: string
  agentName: string
  agentText: string
  agentCheckmark: string
  agentResponseCount: string
  agentFocusedBg: string
  agentContentText: string
  agentToggleHeaderBg: string
  agentToggleHeaderText: string
  agentToggleText: string
  agentContentBg: string
  markdown?: MarkdownThemeOverrides
}

type ChatThemeOverrides = Partial<Omit<ChatTheme, 'markdown'>> & {
  markdown?: MarkdownThemeOverrides
}
type ThemeOverrideConfig = Partial<Record<ThemeName, ChatThemeOverrides>> & {
  all?: ChatThemeOverrides
}

const CHAT_THEME_ENV_KEYS = [
  'OPEN_TUI_CHAT_THEME_OVERRIDES',
  'OPENTUI_CHAT_THEME_OVERRIDES',
]

const mergeMarkdownOverrides = (
  base: MarkdownThemeOverrides | undefined,
  override: MarkdownThemeOverrides | undefined,
): MarkdownThemeOverrides | undefined => {
  if (!base && !override) return undefined
  if (!override)
    return base
      ? {
          ...base,
          headingFg: base.headingFg ? { ...base.headingFg } : undefined,
        }
      : undefined

  const mergedHeading = {
    ...(base?.headingFg ?? {}),
    ...(override.headingFg ?? {}),
  }

  return {
    ...(base ?? {}),
    ...override,
    headingFg:
      Object.keys(mergedHeading).length > 0
        ? (mergedHeading as Partial<Record<MarkdownHeadingLevel, string>>)
        : undefined,
  }
}

const mergeTheme = (
  base: ChatTheme,
  override?: ChatThemeOverrides,
): ChatTheme => {
  if (!override) {
    return {
      ...base,
      markdown: base.markdown
        ? {
            ...base.markdown,
            headingFg: base.markdown.headingFg
              ? { ...base.markdown.headingFg }
              : undefined,
          }
        : undefined,
    }
  }

  return {
    ...base,
    ...override,
    markdown: mergeMarkdownOverrides(base.markdown, override.markdown),
  }
}

const parseThemeOverrides = (
  raw: string,
): Partial<Record<ThemeName, ChatThemeOverrides>> => {
  try {
    const parsed = JSON.parse(raw) as ThemeOverrideConfig
    if (!parsed || typeof parsed !== 'object') return {}

    const result: Partial<Record<ThemeName, ChatThemeOverrides>> = {}
    const common =
      typeof parsed.all === 'object' && parsed.all ? parsed.all : undefined

    for (const themeName of ['dark', 'light'] as ThemeName[]) {
      const specific =
        typeof parsed?.[themeName] === 'object' && parsed?.[themeName]
          ? parsed?.[themeName]
          : undefined

      const mergedOverrides =
        common || specific
          ? {
              ...(common ?? {}),
              ...(specific ?? {}),
              markdown: mergeMarkdownOverrides(
                common?.markdown,
                specific?.markdown,
              ),
            }
          : undefined

      if (mergedOverrides) {
        result[themeName] = mergedOverrides
      }
    }

    return result
  } catch {
    return {}
  }
}

const loadThemeOverrides = (): Partial<
  Record<ThemeName, ChatThemeOverrides>
> => {
  for (const key of CHAT_THEME_ENV_KEYS) {
    const raw = process.env[key]
    if (raw && raw.trim().length > 0) {
      return parseThemeOverrides(raw)
    }
  }
  return {}
}

const textDecoder = new TextDecoder()

const readSpawnOutput = (output: unknown): string => {
  if (!output) return ''
  if (typeof output === 'string') return output.trim()
  if (output instanceof Uint8Array) return textDecoder.decode(output).trim()
  return ''
}

const runSystemCommand = (command: string[]): string | null => {
  if (typeof Bun === 'undefined') return null
  if (command.length === 0) return null

  const [binary] = command
  if (!binary) return null

  const resolvedBinary =
    Bun.which(binary) ??
    (process.platform === 'win32' ? Bun.which(`${binary}.exe`) : null)
  if (!resolvedBinary) return null

  try {
    const result = Bun.spawnSync({
      cmd: [resolvedBinary, ...command.slice(1)],
      stdout: 'pipe',
      stderr: 'pipe',
    })
    if (result.exitCode !== 0) return null
    return readSpawnOutput(result.stdout)
  } catch {
    return null
  }
}

const detectPlatformTheme = (): ThemeName => {
  if (typeof Bun !== 'undefined') {
    if (process.platform === 'darwin') {
      const value = runSystemCommand([
        'defaults',
        'read',
        '-g',
        'AppleInterfaceStyle',
      ])
      if (value?.toLowerCase() === 'dark') return 'dark'
      return 'light'
    }

    if (process.platform === 'win32') {
      const value = runSystemCommand([
        'powershell',
        '-NoProfile',
        '-Command',
        '(Get-ItemProperty -Path HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize).AppsUseLightTheme',
      ])
      if (value === '0') return 'dark'
      if (value === '1') return 'light'
    }

    if (process.platform === 'linux') {
      const value = runSystemCommand([
        'gsettings',
        'get',
        'org.gnome.desktop.interface',
        'color-scheme',
      ])
      if (value?.toLowerCase().includes('dark')) return 'dark'
      if (value?.toLowerCase().includes('light')) return 'light'
    }
  }

  return 'dark'
}

const detectSystemTheme = (): ThemeName => {
  const envPreference = process.env.OPEN_TUI_THEME ?? process.env.OPENTUI_THEME
  const normalizedEnv = envPreference?.toLowerCase()

  if (normalizedEnv === 'dark' || normalizedEnv === 'light') {
    return normalizedEnv
  }

  const platformTheme = detectPlatformTheme()

  if (normalizedEnv === 'opposite') {
    return platformTheme === 'dark' ? 'light' : 'dark'
  }

  return platformTheme
}

const DEFAULT_CHAT_THEMES: Record<ThemeName, ChatTheme> = {
  dark: {
    background: '#000000',
    chromeBg: '#000000',
    chromeText: '#9ca3af',
    accentBg: '#facc15',
    accentText: '#1c1917',
    panelBg: '#000000',
    aiLine: '#34d399',
    userLine: '#38bdf8',
    timestampAi: '#4ade80',
    timestampUser: '#60a5fa',
    messageAiText: '#f1f5f9',
    messageUserText: '#dbeafe',
    messageBg: '#000000',
    statusAccent: '#facc15',
    statusSecondary: '#a3aed0',
    inputBg: '#000000',
    inputFg: '#f5f5f5',
    inputFocusedBg: '#000000',
    inputFocusedFg: '#ffffff',
    inputPlaceholder: '#a3a3a3',
    cursor: '#22c55e',
    agentPrefix: '#22c55e',
    agentName: '#4ade80',
    agentText: '#d1d5db',
    agentCheckmark: '#22c55e',
    agentResponseCount: '#9ca3af',
    agentFocusedBg: '#334155',
    agentContentText: '#ffffff',
    agentToggleHeaderBg: '#16a34a',
    agentToggleHeaderText: '#ffffff',
    agentToggleText: '#ffffff',
    agentContentBg: '#000000',
    markdown: {
      codeBackground: '#1f2933',
      codeHeaderFg: '#5b647a',
      inlineCodeFg: '#f1f5f9',
      codeTextFg: '#f1f5f9',
      headingFg: {
        1: '#facc15',
        2: '#facc15',
        3: '#facc15',
        4: '#facc15',
        5: '#facc15',
        6: '#facc15',
      },
      listBulletFg: '#a3aed0',
      blockquoteBorderFg: '#334155',
      blockquoteTextFg: '#e2e8f0',
      dividerFg: '#283042',
      codeMonochrome: true,
    },
  },
  light: {
    background: '#ffffff',
    chromeBg: '#f3f4f6',
    chromeText: '#374151',
    accentBg: '#f59e0b',
    accentText: '#111827',
    panelBg: '#ffffff',
    aiLine: '#059669',
    userLine: '#3b82f6',
    timestampAi: '#047857',
    timestampUser: '#2563eb',
    messageAiText: '#111827',
    messageUserText: '#1f2937',
    messageBg: '#ffffff',
    statusAccent: '#f59e0b',
    statusSecondary: '#6b7280',
    inputBg: '#f9fafb',
    inputFg: '#111827',
    inputFocusedBg: '#ffffff',
    inputFocusedFg: '#000000',
    inputPlaceholder: '#9ca3af',
    cursor: '#3b82f6',
    agentPrefix: '#059669',
    agentName: '#047857',
    agentText: '#1f2937',
    agentCheckmark: '#059669',
    agentResponseCount: '#6b7280',
    agentFocusedBg: '#e5e7eb',
    agentContentText: '#111827',
    agentToggleHeaderBg: '#059669',
    agentToggleHeaderText: '#ffffff',
    agentToggleText: '#ffffff',
    agentContentBg: '#ffffff',
    markdown: {
      codeBackground: '#f3f4f6',
      codeHeaderFg: '#6b7280',
      inlineCodeFg: '#dc2626',
      codeTextFg: '#111827',
      headingFg: {
        1: '#dc2626',
        2: '#dc2626',
        3: '#dc2626',
        4: '#dc2626',
        5: '#dc2626',
        6: '#dc2626',
      },
      listBulletFg: '#6b7280',
      blockquoteBorderFg: '#d1d5db',
      blockquoteTextFg: '#374151',
      dividerFg: '#e5e7eb',
      codeMonochrome: true,
    },
  },
}

const chatThemes = (() => {
  const overrides = loadThemeOverrides()
  return {
    dark: mergeTheme(DEFAULT_CHAT_THEMES.dark, overrides.dark),
    light: mergeTheme(DEFAULT_CHAT_THEMES.light, overrides.light),
  }
})()

const createMarkdownPalette = (theme: ChatTheme): MarkdownPalette => {
  const headingDefaults: Record<MarkdownHeadingLevel, string> = {
    1: theme.statusAccent,
    2: theme.statusAccent,
    3: theme.statusAccent,
    4: theme.statusAccent,
    5: theme.statusAccent,
    6: theme.statusAccent,
  }

  const overrides = theme.markdown?.headingFg ?? {}

  return {
    inlineCodeFg: theme.markdown?.inlineCodeFg ?? theme.messageAiText,
    codeBackground: theme.markdown?.codeBackground ?? theme.messageBg,
    codeHeaderFg: theme.markdown?.codeHeaderFg ?? theme.statusSecondary,
    headingFg: {
      ...headingDefaults,
      ...overrides,
    },
    listBulletFg: theme.markdown?.listBulletFg ?? theme.statusSecondary,
    blockquoteBorderFg:
      theme.markdown?.blockquoteBorderFg ?? theme.statusSecondary,
    blockquoteTextFg: theme.markdown?.blockquoteTextFg ?? theme.messageAiText,
    dividerFg: theme.markdown?.dividerFg ?? theme.statusSecondary,
    codeTextFg: theme.markdown?.codeTextFg ?? theme.messageAiText,
    codeMonochrome: theme.markdown?.codeMonochrome ?? true,
  }
}

const timestampFormatter = (() => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return null
  }
})()

function formatTimestamp(date = new Date()): string {
  if (timestampFormatter) {
    return timestampFormatter.format(date)
  }
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const QUEUE_PREVIEW_MIN = 10

const formatQueuedPreview = (messages: string[], maxChars: number): string => {
  if (messages.length === 0) return ''

  const latestMessage = messages[messages.length - 1]
  const singleLine = latestMessage.replace(/\s+/g, ' ').trim()
  if (!singleLine) return ''

  const countSuffix = messages.length > 1 ? ` (+ ${messages.length - 1})` : ''
  const availableChars = maxChars - countSuffix.length - 4

  let messagePreview = singleLine
  if (singleLine.length > availableChars) {
    messagePreview =
      singleLine.slice(0, Math.max(0, availableChars - 3)) + '...'
  }

  return `↑ ${messagePreview}${countSuffix} ↑`
}

const QueueIndicator = ({
  messages,
  theme,
  width,
}: {
  messages: string[]
  theme: ChatTheme
  width: number
}) => {
  if (messages.length === 0) {
    return <text content="" style={{ height: 0, marginBottom: 0 }} />
  }

  return (
    <text
      content={formatQueuedPreview(
        messages,
        Math.max(QUEUE_PREVIEW_MIN, width - 6),
      )}
      wrap={false}
      fg={theme.statusSecondary}
      bg={theme.inputFocusedBg}
      style={{
        paddingLeft: 1,
        paddingRight: 1,
        marginBottom: 1,
      }}
    />
  )
}

const completionMessages = [
  'All changes have been applied successfully.',
  'Implementation complete. Ready for your next request.',
  'Done! All requested modifications are in place.',
  'Changes completed and verified.',
  'Finished! Everything is working as expected.',
  'All tasks completed successfully.',
  'Implementation finished. All systems go!',
  'Done! All updates have been applied.',
]

export const App = ({ initialPrompt }: { initialPrompt?: string } = {}) => {
  const renderer = useRenderer()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const inputRef = useRef<InputRenderable | null>(null)
  const [inputRenderable, setInputRenderable] =
    useState<InputRenderable | null>(null)
  const [inputWidth, setInputWidth] = useState<number>(0)
  const autoScrollEnabledRef = useRef<boolean>(true)
  const programmaticScrollRef = useRef<boolean>(false)

  const [themeName, setThemeName] = useState<ThemeName>(() =>
    detectSystemTheme(),
  )
  const theme = chatThemes[themeName]
  const markdownPalette = useMemo(() => createMarkdownPalette(theme), [theme])

  const [inputValue, setInputValue] = useState<string>('')
  const [inputFocused, setInputFocused] = useState<boolean>(true)

  const [queuedMessages, setQueuedMessages] = useState<string[]>([])
  const [isStreaming, setIsStreaming] = useState<boolean>(false)
  const [canProcessQueue, setCanProcessQueue] = useState<boolean>(true)
  const [isWaitingForResponse, setIsWaitingForResponse] =
    useState<boolean>(false)
  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null)
  const clipboardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasStatus = useHasStatus(isWaitingForResponse, clipboardMessage)
  const queuedMessagesRef = useRef<string[]>([])
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamMessageIdRef = useRef<string | null>(null)
  const activeAgentStreamsRef = useRef<number>(0)
  const allAgentsScheduledRef = useRef<boolean>(false)
  const isChainInProgressRef = useRef<boolean>(false)

  const [collapsedAgents, setCollapsedAgents] = useState<Set<string>>(new Set())
  const [streamingAgents, setStreamingAgents] = useState<Set<string>>(new Set())
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null)
  const agentIdsRef = useRef<string[]>([])
  const agentRefsMap = useRef<Map<string, any>>(new Map())

  const messageHistoryRef = useRef<string[]>([])
  const historyIndexRef = useRef<number>(-1)
  const currentDraftRef = useRef<string>('')

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

  const handleInputRef = useCallback((instance: InputRenderable | null) => {
    inputRef.current = instance
    setInputRenderable(instance)
    if (instance) {
      setInputWidth(Math.max(0, instance.width))
    }
  }, [])

  const clearStreaming = useCallback(() => {
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current)
      streamTimeoutRef.current = null
    }
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current)
      streamIntervalRef.current = null
    }
    streamMessageIdRef.current = null
    activeAgentStreamsRef.current = 0
    setIsStreaming(false)
  }, [])

  useEffect(() => {
    return () => {
      clearStreaming()
      if (clipboardTimeoutRef.current) {
        clearTimeout(clipboardTimeoutRef.current)
      }
    }
  }, [clearStreaming])

  const copyToClipboard = useCallback(async (text: string) => {
    if (!text || text.trim().length === 0) return

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text)
      } else if (typeof process !== 'undefined' && process.platform) {
        const { execSync } = require('child_process')
        if (process.platform === 'darwin') {
          execSync('pbcopy', { input: text })
        } else if (process.platform === 'linux') {
          try {
            execSync('xclip -selection clipboard', { input: text })
          } catch {
            execSync('xsel --clipboard --input', { input: text })
          }
        } else if (process.platform === 'win32') {
          execSync('clip', { input: text })
        }
      } else {
        return
      }

      if (clipboardTimeoutRef.current) {
        clearTimeout(clipboardTimeoutRef.current)
      }

      setClipboardMessage('Copied to clipboard')
      clipboardTimeoutRef.current = setTimeout(() => {
        setClipboardMessage(null)
        clipboardTimeoutRef.current = null
      }, 3000)
    } catch (error) {
      logger.error('Failed to copy to clipboard', error)
    }
  }, [])

  useEffect(() => {
    const handleSelection = () => {
      const selection = (renderer as any)?.getSelection?.()
      if (selection && selection.length > 0) {
        void copyToClipboard(selection)
      }
    }

    if (renderer) {
      renderer.on?.('selectionchange', handleSelection)
      return () => {
        renderer.off?.('selectionchange', handleSelection)
      }
    }
    return undefined
  }, [renderer, copyToClipboard])



  useEffect(() => {
    const isAgentVisible = (agentId: string): boolean => {
      const agent = messages.find((m) => m.id === agentId)
      if (!agent || agent.variant !== 'agent') return false

      const parent = messages.find((m) => m.id === agent.parentId)
      if (!parent || parent.variant !== 'agent') return true

      if (collapsedAgents.has(parent.id)) return false

      return isAgentVisible(parent.id)
    }

    const agentIds = messages
      .filter((m) => m.variant === 'agent' && isAgentVisible(m.id))
      .map((m) => m.id)
    agentIdsRef.current = agentIds.reverse()

    if (focusedAgentId && !agentIds.includes(focusedAgentId)) {
      setFocusedAgentId(null)
    }
  }, [messages, focusedAgentId, collapsedAgents])

  useEffect(() => {
    renderer?.setBackgroundColor(theme.background)
  }, [renderer, theme.background])

  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox) return

    const handleScrollChange = () => {
      const maxScroll = Math.max(
        0,
        scrollbox.scrollHeight - scrollbox.viewport.height,
      )
      const current = scrollbox.verticalScrollBar.scrollPosition
      const isNearBottom = Math.abs(maxScroll - current) <= 1

      if (programmaticScrollRef.current) {
        programmaticScrollRef.current = false
        autoScrollEnabledRef.current = true
        return
      }

      autoScrollEnabledRef.current = isNearBottom
    }

    scrollbox.verticalScrollBar.on('change', handleScrollChange)

    return () => {
      scrollbox.verticalScrollBar.off('change', handleScrollChange)
    }
  }, [])

  useEffect(() => {
    queuedMessagesRef.current = queuedMessages
  }, [queuedMessages])

  useEffect(() => {
    const instance = inputRenderable
    if (!instance) return

    const updateWidth = () => {
      setInputWidth(Math.max(0, instance.width))
    }

    updateWidth()

    const handleResize = ({ width }: { width: number }) => {
      setInputWidth(Math.max(0, width))
    }

    instance.on(LayoutEvents.RESIZED, handleResize)

    return () => {
      instance.off(LayoutEvents.RESIZED, handleResize)
    }
  }, [inputRenderable])

  const scrollToLatest = useCallback((): void => {
    const scrollbox = scrollRef.current
    if (!scrollbox) return

    const maxScroll = Math.max(
      0,
      scrollbox.scrollHeight - scrollbox.viewport.height,
    )
    programmaticScrollRef.current = true
    scrollbox.verticalScrollBar.scrollPosition = maxScroll
  }, [])

  useEffect(() => {
    const scrollbox = scrollRef.current
    if (scrollbox) {
      const timeoutId = setTimeout(() => {
        const maxScroll = Math.max(
          0,
          scrollbox.scrollHeight - scrollbox.viewport.height,
        )

        if (scrollbox.scrollTop > maxScroll) {
          scrollbox.scrollTop = maxScroll
        } else if (autoScrollEnabledRef.current) {
          scrollToLatest()
        }
      }, 50)

      return () => clearTimeout(timeoutId)
    }
    return undefined
  }, [messages, scrollToLatest])

  const previousRunStateRef = useRef<any>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (content: string, onComplete?: () => void) => {
      if (onComplete) {
        completionCallbackRef.current = onComplete
      }
      const timestamp = formatTimestamp()
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        variant: 'user',
        content,
        timestamp,
      }

      setMessages((prev) => {
        const newMessages = [...prev, userMessage]
        if (newMessages.length > 100) {
          return newMessages.slice(-100)
        }
        return newMessages
      })
      setFocusedAgentId(null)
      setInputFocused(true)
      inputRef.current?.focus()

      const client = getCodebuffClient()

      if (!client) {
        logger.info('No API client available, using mock mode')
        const aiMessageId = `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`
        const aiMessage: ChatMessage = {
          id: aiMessageId,
          variant: 'ai',
          content: '',
          timestamp: formatTimestamp(),
        }

        setMessages((prev) => [...prev, aiMessage])

        const fullResponse = `I've reviewed your message. Let me help with that.\n\n## Analysis\n\nBased on your request, here are the key points:\n\n1. **Architecture**: The current structure is well-organized\n2. **Performance**: Consider adding memoization for expensive calculations\n3. **Testing**: Add unit tests using \`bun:test\`\n\n### Code Example\n\n\`\`\`typescript\n// Add this optimization\nconst memoized = useMemo(() => {\n  return expensiveCalculation(data)\n}, [data])\n\`\`\`\n\nThis approach will improve _performance_ while maintaining **code clarity**.`

        const tokens = fullResponse.split(/(\s+)/)
        let index = 0
        const interval = setInterval(() => {
          if (index >= tokens.length) {
            clearInterval(interval)
            setIsStreaming(false)
            setCanProcessQueue(true)

            const completionMessageId = `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`
            const completionMessage: ChatMessage = {
              id: completionMessageId,
              variant: 'ai',
              content:
                completionMessages[
                  Math.floor(Math.random() * completionMessages.length)
                ],
              timestamp: formatTimestamp(),
              isCompletion: true,
              credits: Math.floor(Math.random() * (230 - 18 + 1)) + 18,
            }
            setMessages((prev) => [...prev, completionMessage])
            return
          }

          const nextChunk = tokens[index]
          index++

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId
                ? { ...msg, content: msg.content + nextChunk }
                : msg,
            ),
          )
        }, 28)

        logger.info('Starting mock response streaming')
        setIsStreaming(true)
        setCanProcessQueue(false)
        return
      }

      logger.info('Starting real API request', { prompt: content })

      const aiMessageId = `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const aiMessage: ChatMessage = {
        id: aiMessageId,
        variant: 'ai',
        content: '',
        blocks: [],
        timestamp: formatTimestamp(),
      }

      logger.info('Initiating SDK client.run()')
      setIsWaitingForResponse(true)
      setMessages((prev) => [...prev, aiMessage])
      setIsStreaming(true)
      setCanProcessQueue(false)
      isChainInProgressRef.current = true

      const startTime = Date.now()
      let hasReceivedContent = false
      let actualCredits: number | undefined = undefined

      const abortController = new AbortController()
      abortControllerRef.current = abortController

      try {
        const result = await client.run({
          agent: 'base',
          prompt: content,
          previousRun: previousRunStateRef.current,
          signal: abortController.signal,

          handleStreamChunk: (chunk: any) => {
            const isSubagentChunk = activeSubagentsRef.current.size > 0

            if (isSubagentChunk) {
              logger.info('Subagent chunk received', { chunk })
            }

            const keys = Object.keys(chunk)
              .filter((k) => !isNaN(Number(k)))
              .sort((a, b) => Number(a) - Number(b))
            const text = keys.map((k) => chunk[k]).join('')

            if (!text) return

            if (!hasReceivedContent) {
              hasReceivedContent = true
              setIsWaitingForResponse(false)
            }            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id === aiMessageId) {
                  const blocks = msg.blocks || []
                  const lastBlock = blocks[blocks.length - 1]
                  
                  if (lastBlock && lastBlock.type === 'text') {
                    const newContent = lastBlock.content + text
                    return {
                      ...msg,
                      blocks: [
                        ...blocks.slice(0, -1),
                        { type: 'text', content: newContent },
                      ],
                    }
                  } else {
                    return {
                      ...msg,
                      blocks: [...blocks, { type: 'text', content: text }],
                    }
                  }
                }
                return msg
              }),
            )
          },
          handleEvent: (event: any) => {
            logger.info('SDK Event received', { type: event.type, event })

            if (event.type === 'subagent-chunk') {
              logger.info('Subagent chunk received', {
                agentId: event.agentId,
                agentType: event.agentType,
                chunk: event.chunk,
              })
            }

            if (event.type === 'finish' && event.totalCost !== undefined) {
              actualCredits = event.totalCost
            }

            if (event.credits !== undefined) {
              actualCredits = event.credits
            }

            if (
              event.type === 'subagent_start' ||
              event.type === 'subagent-start'
            ) {
              if (event.agentId) {
                activeSubagentsRef.current.add(event.agentId)
              }
            } else if (
              event.type === 'subagent_finish' ||
              event.type === 'subagent-finish'
            ) {
              if (event.agentId) {
                activeSubagentsRef.current.delete(event.agentId)
              }
            }

            if (event.type === 'tool_call' && event.toolCallId) {
              const { toolCallId, toolName, input } = event

              const hiddenTools: ToolName[] = ['spawn_agent_inline', 'end_turn']
              if (hiddenTools.includes(toolName)) {
                return
              }

              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id === aiMessageId) {
                    const blocks = msg.blocks || []
                    return {
                      ...msg,
                      blocks: [
                        ...blocks,
                        { type: 'tool', toolCallId, toolName, input },
                      ],
                    }
                  }
                  return msg
                }),
              )

              setStreamingAgents((prev) => new Set(prev).add(toolCallId))
              setCollapsedAgents((prev) => new Set(prev).add(toolCallId))
            } else if (event.type === 'tool_result' && event.toolCallId) {
              const { toolCallId } = event

              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id === aiMessageId && msg.blocks) {
                    const blocks = msg.blocks.map((block) => {
                      if (
                        block.type === 'tool' &&
                        block.toolCallId === toolCallId
                      ) {
                        let output: string
                        if (event.error) {
                          output = `**Error:** ${typeof event.error === 'string' ? event.error : JSON.stringify(event.error)}`
                        } else if (block.toolName === 'run_terminal_command') {
                          const parsed = event.output?.[0]?.value
                          if (parsed?.stdout || parsed?.stderr) {
                            output = (parsed.stdout || '') + (parsed.stderr || '')
                          } else {
                            output = formatToolOutput(event.output)
                          }
                        } else {
                          output = formatToolOutput(event.output)
                        }
                        return { ...block, output }
                      }
                      return block
                    })
                    return { ...msg, blocks }
                  }
                  return msg
                }),
              )

              setStreamingAgents((prev) => {
                const next = new Set(prev)
                next.delete(toolCallId)
                return next
              })
            }
          },
        })

        logger.info('SDK client.run() completed successfully', {
          credits: actualCredits,
        })
        setIsStreaming(false)
        setCanProcessQueue(true)
        isChainInProgressRef.current = false
        setIsWaitingForResponse(false)

        if ((result as any)?.credits !== undefined) {
          actualCredits = (result as any).credits
        }

        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1)
        
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? {
                  ...msg,
                  isComplete: true,
                  completionTime: `${elapsedTime}s`,
                  ...(actualCredits !== undefined && { credits: actualCredits }),
                }
              : msg,
          ),
        )

        previousRunStateRef.current = result

        if (completionCallbackRef.current) {
          const callback = completionCallbackRef.current
          completionCallbackRef.current = null
          callback()
        }
      } catch (error) {
        const isAborted = error instanceof Error && error.name === 'AbortError'

        logger.error('SDK client.run() failed', error)
        setIsStreaming(false)
        setCanProcessQueue(true)
        isChainInProgressRef.current = false
        setIsWaitingForResponse(false)

        if (isAborted) {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === aiMessageId) {
                const blocks = msg.blocks || []
                const lastBlock = blocks[blocks.length - 1]
                
                if (lastBlock && lastBlock.type === 'text') {
                  return {
                    ...msg,
                    blocks: [
                      ...blocks.slice(0, -1),
                      { type: 'text', content: lastBlock.content + '\n\n[response interrupted]' },
                    ],
                    isComplete: true,
                  }
                } else {
                  return {
                    ...msg,
                    blocks: [...blocks, { type: 'text', content: '[response interrupted]' }],
                    isComplete: true,
                  }
                }
              }
              return msg
            }),
          )
        } else {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error occurred'
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId
                ? {
                    ...msg,
                    content: msg.content + `\n\n**Error:** ${errorMessage}`,
                  }
                : msg,
            ),
          )

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId
                ? { ...msg, isComplete: true }
                : msg,
            ),
          )
        }

        if (completionCallbackRef.current) {
          const callback = completionCallbackRef.current
          completionCallbackRef.current = null
          callback()
        }
      }
    }, [])

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

  useEffect(() => {
    if (!canProcessQueue) return
    if (isStreaming) return
    if (streamMessageIdRef.current) return
    if (isChainInProgressRef.current) return
    if (activeAgentStreamsRef.current > 0) return

    const queuedList = queuedMessagesRef.current
    if (queuedList.length === 0) return

    const timeoutId = setTimeout(() => {
      const nextMessage = queuedList[0]
      const remainingMessages = queuedList.slice(1)
      queuedMessagesRef.current = remainingMessages
      setQueuedMessages(remainingMessages)
      sendMessage(nextMessage)
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [canProcessQueue, isStreaming, sendMessage])

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return

    messageHistoryRef.current = [...messageHistoryRef.current, trimmed]
    historyIndexRef.current = -1
    currentDraftRef.current = ''

    setInputValue('')

    if (
      isStreaming ||
      streamMessageIdRef.current ||
      isChainInProgressRef.current
    ) {
      const newQueue = [...queuedMessagesRef.current, trimmed]
      queuedMessagesRef.current = newQueue
      setQueuedMessages(newQueue)
      setInputFocused(true)
      inputRef.current?.focus()
      return
    }

    sendMessage(trimmed)
  }, [inputValue, isStreaming, sendMessage])

  const handleThemeToggle = useCallback(() => {
    setThemeName((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  useKeyboard(
    useCallback(
      (key) => {
        if (key.ctrl && key.name === 't') {
          handleThemeToggle()
        }
      },
      [handleThemeToggle],
    ),
  )

  useKeyboard(
    useCallback(
      (key) => {
        const isEscape = key.name === 'escape'
        const isCtrlC = key.ctrl && key.name === 'c'

        if ((isEscape || isCtrlC) && (isStreaming || isWaitingForResponse)) {
          if (
            'preventDefault' in key &&
            typeof key.preventDefault === 'function'
          ) {
            key.preventDefault()
          }

          if (abortControllerRef.current) {
            abortControllerRef.current.abort()
          }
        }
      },
      [isStreaming, isWaitingForResponse],
    ),
  )

  useKeyboard(
    useCallback(
      (key) => {
        if (!focusedAgentId) return
        if (inputRenderable?.focused && inputRenderable.value.length > 0) return

        const isSpace =
          key.name === 'space' && !key.ctrl && !key.meta && !key.shift
        const isEnter =
          (key.name === 'return' || key.name === 'enter') &&
          !key.ctrl &&
          !key.meta &&
          !key.shift
        const isRightArrow =
          key.name === 'right' && !key.ctrl && !key.meta && !key.shift
        const isLeftArrow =
          key.name === 'left' && !key.ctrl && !key.meta && !key.shift

        if (!isSpace && !isEnter && !isRightArrow && !isLeftArrow) return

        if (
          'preventDefault' in key &&
          typeof key.preventDefault === 'function'
        ) {
          key.preventDefault()
        }

        if (isRightArrow) {
          setCollapsedAgents((prev) => {
            const next = new Set(prev)
            next.delete(focusedAgentId)
            return next
          })
        } else if (isLeftArrow) {
          setCollapsedAgents((prev) => {
            const next = new Set(prev)
            next.add(focusedAgentId)
            return next
          })
        } else {
          setCollapsedAgents((prev) => {
            const next = new Set(prev)
            if (next.has(focusedAgentId)) {
              next.delete(focusedAgentId)
            } else {
              next.add(focusedAgentId)
            }
            return next
          })
        }
      },
      [focusedAgentId, inputRenderable],
    ),
  )

  useKeyboard(
    useCallback(
      (key) => {
        if (key.name === 'escape' && focusedAgentId) {
          if (
            'preventDefault' in key &&
            typeof key.preventDefault === 'function'
          ) {
            key.preventDefault()
          }
          setFocusedAgentId(null)
          setInputFocused(true)
          inputRef.current?.focus()
        }
      },
      [focusedAgentId],
    ),
  )

  useKeyboard(
    useCallback(
      (key) => {
        if (!inputRenderable || !inputRenderable.focused) return

        const isUpArrow =
          key.name === 'up' && !key.ctrl && !key.meta && !key.shift
        const isDownArrow =
          key.name === 'down' && !key.ctrl && !key.meta && !key.shift

        if (!isUpArrow && !isDownArrow) return

        const history = messageHistoryRef.current
        if (history.length === 0) return

        const cursor = inputRenderable.cursorPosition
        const value = inputRenderable.value
        const atStart = cursor === 0
        const atEnd = cursor === value.length

        if (isUpArrow && !atStart) return
        if (isDownArrow && !atEnd) return

        if (
          'preventDefault' in key &&
          typeof key.preventDefault === 'function'
        ) {
          key.preventDefault()
        }

        if (isUpArrow) {
          if (historyIndexRef.current === -1) {
            currentDraftRef.current = value
            historyIndexRef.current = history.length - 1
          } else if (historyIndexRef.current > 0) {
            historyIndexRef.current -= 1
          }

          const historyMessage = history[historyIndexRef.current]
          setInputValue(historyMessage)
          setTimeout(() => {
            if (inputRenderable) {
              inputRenderable.cursorPosition = historyMessage.length
            }
          }, 0)
        } else if (isDownArrow) {
          if (historyIndexRef.current === -1) {
            return
          }

          if (historyIndexRef.current < history.length - 1) {
            historyIndexRef.current += 1
            const historyMessage = history[historyIndexRef.current]
            setInputValue(historyMessage)
            setTimeout(() => {
              if (inputRenderable) {
                inputRenderable.cursorPosition = historyMessage.length
              }
            }, 0)
          } else {
            historyIndexRef.current = -1
            const draft = currentDraftRef.current
            setInputValue(draft)
            setTimeout(() => {
              if (inputRenderable) {
                inputRenderable.cursorPosition = draft.length
              }
            }, 0)
          }
        }
      },
      [inputRenderable],
    ),
  )

  const registerAgentRef = useCallback((agentId: string, element: any) => {
    if (element) {
      agentRefsMap.current.set(agentId, element)
    } else {
      agentRefsMap.current.delete(agentId)
    }
  }, [])

  const scrollToAgent = useCallback((agentId: string, retries = 5) => {
    setTimeout(() => {
      const scrollbox = scrollRef.current
      if (!scrollbox) return

      const agentElement = agentRefsMap.current.get(agentId)
      if (!agentElement) {
        if (retries > 0) {
          scrollToAgent(agentId, retries - 1)
        }
        return
      }

      const agentViewportY = agentElement.y ?? 0
      const agentHeight = agentElement.height ?? 0
      const viewportHeight = scrollbox.viewport.height
      const scrollHeight = scrollbox.scrollHeight
      const currentScroll = scrollbox.scrollTop

      const agentY = agentViewportY + currentScroll
      const absoluteMaxScroll = Math.max(0, scrollHeight - viewportHeight)
      const minScroll = Math.max(0, agentY + agentHeight - viewportHeight)
      const maxScrollBound = Math.min(agentY, absoluteMaxScroll)

      if (currentScroll >= minScroll && currentScroll <= maxScrollBound) {
        return
      }

      const idealViewportY = Math.floor(viewportHeight / 3)
      const idealScroll = agentY - idealViewportY

      let targetScroll: number
      if (minScroll > maxScrollBound) {
        targetScroll = Math.min(agentY, absoluteMaxScroll)
      } else {
        targetScroll = Math.max(
          minScroll,
          Math.min(idealScroll, maxScrollBound),
        )
      }

      programmaticScrollRef.current = true
      scrollbox.scrollTo(targetScroll)
    }, 100)
  }, [])

  const messageItems = useMemo(() => {
    const availableWidth = renderer?.width ?? 80

    const messageTree = new Map<string, ChatMessage[]>()
    const topLevelMessages: ChatMessage[] = []

    for (const message of messages) {
      if (message.parentId) {
        const siblings = messageTree.get(message.parentId) ?? []
        siblings.push(message)
        messageTree.set(message.parentId, siblings)
      } else {
        topLevelMessages.push(message)
      }
    }

    const renderAgentMessage = (
      message: ChatMessage,
      depth: number,
      isLastSibling: boolean,
      ancestorBranches: boolean[] = [],
    ): ReactNode => {
      const agentInfo = message.agent!
      const isCollapsed = collapsedAgents.has(message.id)
      const isStreaming = streamingAgents.has(message.id)
      const isFocused = focusedAgentId === message.id

      const agentChildren = messageTree.get(message.id) ?? []

      let branchPrefix = ''
      for (let i = 0; i < ancestorBranches.length; i++) {
        branchPrefix += '   '
      }
      const treeBranch = isLastSibling ? '└─ ' : '├─ '
      const fullPrefix = branchPrefix + treeBranch

      const lines = message.content.split('\n').filter((line) => line.trim())
      const firstLine = lines[0] || ''
      const lastLine = lines[lines.length - 1] || firstLine
      const rawDisplayContent = isCollapsed ? lastLine : message.content

      const streamingPreview = isStreaming
        ? firstLine.replace(/[#*_`~\[\]()]/g, '').trim() + '...'
        : ''

      const finishedPreview =
        !isStreaming && isCollapsed
          ? lastLine.replace(/[#*_`~\[\]()]/g, '').trim()
          : ''

      const agentCodeBlockWidth = Math.max(10, availableWidth - 12)
      const agentPalette: MarkdownPalette = {
        ...markdownPalette,
        inlineCodeFg: theme.agentText,
        codeTextFg: theme.agentText,
      }
      const agentMarkdownOptions = {
        codeBlockWidth: agentCodeBlockWidth,
        palette: agentPalette,
      }
      const displayContent = hasMarkdown(rawDisplayContent)
        ? renderMarkdown(rawDisplayContent, agentMarkdownOptions)
        : rawDisplayContent

      const handleTitleClick = (e: any): void => {
        if (e && e.stopPropagation) {
          e.stopPropagation()
        }

        const getDescendantIds = (agentId: string): string[] => {
          const children = messageTree.get(agentId) ?? []
          const descendantIds: string[] = []

          for (const child of children) {
            if (child.variant === 'agent') {
              descendantIds.push(child.id)
              descendantIds.push(...getDescendantIds(child.id))
            }
          }

          return descendantIds
        }

        setCollapsedAgents((prev) => {
          const next = new Set(prev)

          if (next.has(message.id)) {
            next.delete(message.id)
          } else {
            next.add(message.id)
            const descendantIds = getDescendantIds(message.id)
            descendantIds.forEach((id) => next.add(id))
          }

          return next
        })

        setFocusedAgentId(message.id)
        scrollToAgent(message.id)
      }

      const handleContentClick = (e: any): void => {
        if (e && e.stopPropagation) {
          e.stopPropagation()
        }

        if (!isCollapsed) {
          return
        }

        const getAncestorIds = (agentId: string): string[] => {
          const agent = messages.find((m) => m.id === agentId)
          if (!agent || !agent.parentId) return []
          const parent = messages.find((m) => m.id === agent.parentId)
          if (!parent || parent.variant !== 'agent') return []
          return [parent.id, ...getAncestorIds(parent.id)]
        }

        const ancestorIds = getAncestorIds(message.id)

        setCollapsedAgents((prev) => {
          const next = new Set(prev)

          ancestorIds.forEach((id) => next.delete(id))

          next.delete(message.id)

          return next
        })

        setFocusedAgentId(message.id)
        scrollToAgent(message.id)
      }

      return (
        <box
          key={message.id}
          ref={(el: any) => registerAgentRef(message.id, el)}
          style={{
            flexDirection: 'column',
            gap: 0,
            flexShrink: 0,
          }}
        >
          <box
            style={{
              flexDirection: 'row',
              flexShrink: 0,
            }}
          >
            <text wrap={false}>
              <span fg={theme.agentPrefix}>{fullPrefix}</span>
            </text>
            <box
              style={{
                flexDirection: 'column',
                gap: 0,
                flexShrink: 1,
                flexGrow: 1,
              }}
            >
              <box
                style={{
                  flexDirection: 'row',
                  alignSelf: 'flex-start',
                  backgroundColor: isCollapsed
                    ? theme.agentResponseCount
                    : theme.agentPrefix,
                  paddingLeft: 1,
                  paddingRight: 1,
                }}
                onMouseDown={handleTitleClick}
              >
                <text wrap={false}>
                  <span fg={theme.agentToggleText}>
                    {isCollapsed ? '▸' : '▾'}{' '}
                  </span>
                </text>
                <box style={{ flexShrink: 1 }}>
                  <text wrap>
                    <span
                      fg={theme.agentToggleText}
                      attributes={TextAttributes.BOLD}
                    >
                      {agentInfo.agentName}
                    </span>
                  </text>
                </box>
              </box>
              <box
                style={{ flexShrink: 1, marginBottom: isCollapsed ? 1 : 0 }}
                onMouseDown={handleContentClick}
              >
                {isStreaming && isCollapsed && streamingPreview && (
                  <text
                    wrap
                    fg={theme.agentText}
                    attributes={TextAttributes.ITALIC}
                  >
                    {streamingPreview}
                  </text>
                )}
                {!isStreaming && isCollapsed && finishedPreview && (
                  <text
                    wrap
                    fg={theme.agentResponseCount}
                    attributes={TextAttributes.ITALIC}
                  >
                    {finishedPreview}
                  </text>
                )}
                {!isCollapsed && (
                  <text
                    key={`agent-content-${message.id}`}
                    wrap
                    fg={theme.agentContentText}
                  >
                    {displayContent}
                  </text>
                )}
              </box>
            </box>
          </box>
          {agentChildren.length > 0 && (
            <box
              style={{
                flexDirection: 'column',
                gap: 0,
                flexShrink: 0,
              }}
            >
              {agentChildren.map((childAgent, idx) => (
                <box key={childAgent.id} style={{ flexShrink: 0 }}>
                  {renderMessageWithAgents(
                    childAgent,
                    depth + 1,
                    idx === agentChildren.length - 1,
                    [...ancestorBranches, !isLastSibling],
                  )}
                </box>
              ))}
            </box>
          )}
        </box>
      )
    }

    const renderMessageWithAgents = (
      message: ChatMessage,
      depth = 0,
      isLastSibling = false,
      ancestorBranches: boolean[] = [],
      isLastMessage = false,
    ): ReactNode => {
      const isAgent = message.variant === 'agent'

      if (isAgent) {
        return renderAgentMessage(
          message,
          depth,
          isLastSibling,
          ancestorBranches,
        )
      }

      const isAi = message.variant === 'ai'
      const isUser = message.variant === 'user'
      const isCompletion = message.isCompletion ?? false
      const lineColor = isAi ? theme.aiLine : theme.userLine
      const textColor = isAi ? theme.messageAiText : theme.messageUserText
      const timestampColor = isAi ? theme.timestampAi : theme.timestampUser
      const estimatedMessageWidth = availableWidth
      const codeBlockWidth = Math.max(10, estimatedMessageWidth - 8)
      const paletteForMessage: MarkdownPalette = {
        ...markdownPalette,
        inlineCodeFg: textColor,
        codeTextFg: textColor,
      }
      const markdownOptions = { codeBlockWidth, palette: paletteForMessage }

      const isLoading = isAi && message.content === '' && !message.blocks && isWaitingForResponse

      const agentChildren = messageTree.get(message.id) ?? []
      const hasAgentChildren = agentChildren.length > 0
      const showVerticalLine = isUser || isAi

      return (
        <box
          key={message.id}
          style={{
            width: '100%',
            flexDirection: 'column',
            gap: 0,
            marginBottom: isLastMessage ? 0 : 1,
          }}
        >
          <box
            style={{
              width: '100%',
              flexDirection: 'row',
            }}
          >
            {
              <box
                style={{
                  flexDirection: 'row',
                  gap: 0,
                  alignItems: 'stretch',
                  width: '100%',
                  flexGrow: 1,
                }}
              >
                <box
                  style={{
                    width: 1,
                    backgroundColor: lineColor,
                    marginTop: 0,
                    marginBottom: 0,
                  }}
                />
                <box
                  style={{
                    backgroundColor: theme.messageBg,
                    padding: 0,
                    paddingLeft: 1,
                    paddingRight: 1,
                    paddingTop: 0,
                    paddingBottom: 0,
                    gap: 0,
                    width: '100%',
                    flexGrow: 1,
                    justifyContent: 'center',
                  }}
                >
                  {isUser && (
                    <text
                      wrap={false}
                      attributes={TextAttributes.DIM}
                      style={{
                        fg: timestampColor,
                        marginTop: 0,
                        marginBottom: 0,
                        alignSelf: 'flex-start',
                      }}
                    >
                      {`[${message.timestamp}]`}
                    </text>
                  )}
                  {message.blocks ? (
                    <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
                      {message.blocks.map((block, idx) => {
                        if (block.type === 'text') {
                          const trimmedContent = block.content.trim()
                          const renderedContent = hasMarkdown(trimmedContent)
                            ? renderStreamingMarkdown(trimmedContent, markdownOptions)
                            : trimmedContent
                          const prevBlock = idx > 0 ? message.blocks![idx - 1] : null
                          const marginTop = prevBlock && prevBlock.type === 'tool' ? 0 : 0
                          return (
                            <text
                              key={`${message.id}-text-${idx}`}
                              wrap
                              style={{ fg: textColor, marginTop }}
                            >
                            {renderedContent}
                          </text>
                        )
                      } else {
                          const displayInfo = getToolDisplayInfo(block.toolName)
                          const isCollapsed = collapsedAgents.has(block.toolCallId)
                          const isStreaming = streamingAgents.has(block.toolCallId)
                          
                          const inputContent = `\`\`\`json\n${JSON.stringify(block.input, null, 2)}\n\`\`\``
                          const codeBlockLang = block.toolName === 'run_terminal_command' ? '' : 'yaml'
                          const resultContent = block.output
                            ? `\n\n**Result:**\n\`\`\`${codeBlockLang}\n${block.output}\n\`\`\``
                            : ''
                          const fullContent = inputContent + resultContent
                          
                          const lines = fullContent.split('\n').filter((line) => line.trim())
                          const firstLine = lines[0] || ''
                          const lastLine = lines[lines.length - 1] || firstLine
                          
                        const streamingPreview = isStreaming
                          ? firstLine.replace(/[#*_`~\[\]()]/g, '').trim() + '...'
                          : ''
                        
                        let finishedPreview = ''
                        if (!isStreaming && isCollapsed) {
                          if (block.toolName === 'run_terminal_command' && block.output) {
                            const outputLines = block.output.split('\n').filter(line => line.trim())
                            const lastThreeLines = outputLines.slice(-3)
                            const hasMoreLines = outputLines.length > 3
                            finishedPreview = hasMoreLines 
                              ? '...\n' + lastThreeLines.join('\n')
                              : lastThreeLines.join('\n')
                          } else {
                            finishedPreview = lastLine.replace(/[#*_`~\[\]()]/g, '').trim()
                          }
                        }
                          
                          const agentCodeBlockWidth = Math.max(10, availableWidth - 12)
                          const agentPalette: MarkdownPalette = {
                            ...markdownPalette,
                            inlineCodeFg: theme.agentText,
                            codeTextFg: theme.agentText,
                          }
                          const agentMarkdownOptions = {
                            codeBlockWidth: agentCodeBlockWidth,
                            palette: agentPalette,
                          }
                          const displayContent = hasMarkdown(fullContent)
                            ? renderMarkdown(fullContent, agentMarkdownOptions)
                            : fullContent
                          
                          const nextBlock = message.blocks![idx + 1]
                          const isLastTool = !nextBlock || nextBlock.type === 'text'
                          const branchChar = isLastTool ? '└─ ' : '├─ '
                          
                          return (
                            <box
                              key={`${message.id}-tool-${block.toolCallId}`}
                              style={{ flexDirection: 'row', flexShrink: 0 }}
                            >
                              <text wrap={false}>
                                <span fg={theme.agentPrefix}>{branchChar}</span>
                              </text>
                              <box
                                style={{
                                  flexDirection: 'column',
                                  gap: 0,
                                  flexShrink: 1,
                                  flexGrow: 1,
                                }}
                              >
                                <box
                                  style={{
                                    flexDirection: 'row',
                                    alignSelf: 'flex-start',
                                    backgroundColor: isCollapsed
                                      ? theme.agentResponseCount
                                      : theme.agentPrefix,
                                    paddingLeft: 1,
                                    paddingRight: 1,
                                  }}
                                  onMouseDown={() => {
                                    setCollapsedAgents((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(block.toolCallId)) {
                                        next.delete(block.toolCallId)
                                      } else {
                                        next.add(block.toolCallId)
                                      }
                                      return next
                                    })
                                  }}
                                >
                                  <text wrap={false}>
                                    <span fg={theme.agentToggleText}>
                                      {isCollapsed ? '▸' : '▾'}{' '}
                                    </span>
                                  </text>
                                  <box style={{ flexShrink: 1 }}>
                                    <text wrap>
                                      <span
                                        fg={theme.agentToggleText}
                                        attributes={TextAttributes.BOLD}
                                      >
                                        {displayInfo.name}
                                      </span>
                                    </text>
                                  </box>
                                </box>
                                <box style={{ flexShrink: 1, marginBottom: 0 }}>
                                  {isStreaming && isCollapsed && streamingPreview && (
                                    <text
                                      wrap
                                      fg={theme.agentText}
                                      attributes={TextAttributes.ITALIC}
                                    >
                                      {streamingPreview}
                                    </text>
                                  )}
                                  {!isStreaming && isCollapsed && finishedPreview && (
                                    <text
                                      wrap
                                      fg={theme.agentResponseCount}
                                      attributes={TextAttributes.ITALIC}
                                    >
                                      {finishedPreview}
                                    </text>
                                  )}
                                  {!isCollapsed && (
                                    <text
                                      wrap
                                      fg={theme.agentContentText}
                                    >
                                      {displayContent}
                                    </text>
                                  )}
                                </box>
                              </box>
                            </box>
                          )
                        }
                      })}
                    </box>
                  ) : (
                    <text
                      key={`message-content-${message.id}`}
                      wrap
                      style={{ fg: textColor }}
                    >
                      {isLoading ? '' : hasMarkdown(message.content)
                        ? renderStreamingMarkdown(message.content, markdownOptions)
                        : message.content}
                    </text>
                  )}
                  {isAi && message.isComplete && (message.completionTime || message.credits) && (
                    <text
                      wrap={false}
                      attributes={TextAttributes.DIM}
                      style={{
                        fg: theme.statusSecondary,
                        marginTop: 0,
                        marginBottom: 0,
                        alignSelf: 'flex-start',
                      }}
                    >
                      {message.completionTime}
                      {message.credits && ` • ${message.credits} credits`}
                    </text>
                  )}
                </box>
              </box>
            }
          </box>

          {hasAgentChildren && (
            <box style={{ flexDirection: 'column', width: '100%', gap: 0 }}>
              {agentChildren.map((agent, idx) => (
                <box key={agent.id} style={{ width: '100%' }}>
                  {renderMessageWithAgents(
                    agent,
                    depth + 1,
                    idx === agentChildren.length - 1,
                  )}
                </box>
              ))}
            </box>
          )}
        </box>
      )
    }

    return topLevelMessages.map((message, idx) => {
      const isLast = idx === topLevelMessages.length - 1
      return renderMessageWithAgents(message, 0, false, [], isLast)
    })
  }, [
    messages,
    renderer?.width,
    markdownPalette,
    theme,
    collapsedAgents,
    focusedAgentId,
    isWaitingForResponse,

    streamingAgents,
    registerAgentRef,
    scrollToAgent,
  ])

  const fallbackInputWidth = Math.max(4, renderer.width - 6)
  const effectiveInputWidth = inputWidth > 0 ? inputWidth : fallbackInputWidth
  const maxCharsPerLine = Math.max(1, effectiveInputWidth - 1)
  const textLengthForRows = Math.max(1, inputValue.length)
  const computedLineCount = Math.max(
    1,
    Math.ceil(textLengthForRows / maxCharsPerLine),
  )
  const maxInputHeight = 5
  const inputHeight = Math.max(1, Math.min(computedLineCount, maxInputHeight))

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
            <box
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 1,
              }}
            >
              {hasStatus && (
                <box style={{ paddingLeft: 0 }}>
                  <text wrap={false}>
                    <StatusIndicator
                      isProcessing={isWaitingForResponse}
                      theme={theme}
                      clipboardMessage={clipboardMessage}
                    />
                  </text>
                </box>
              )}
              <box style={{ flexGrow: 1, flexShrink: 1 }}>
                <QueueIndicator
                  messages={queuedMessages}
                  theme={theme}
                  width={renderer.width}
                />
              </box>
            </box>
            {queuedMessages.length > 0 && (
              <box style={{ height: 1 }} />
            )}
          </>
        )}
        <text
          content={'─'.repeat(renderer.width)}
          wrap={false}
          style={{ fg: theme.statusSecondary, height: 1 }}
        />
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
        <text
          content={'─'.repeat(renderer.width)}
          wrap={false}
          style={{ fg: theme.statusSecondary, height: 1 }}
        />
      </box>
    </box>
  )
}
