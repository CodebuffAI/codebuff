import {
  InputRenderable,
  LayoutEvents,
  ScrollBoxRenderable,
  TextAttributes,
} from '@opentui/core'
import { render, useKeyboard, useRenderer } from '@opentui/react'
import { MultilineInput } from './multiline-input'
import { renderMarkdown, hasMarkdown } from './markdown-renderer'
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type ThemeName = 'dark' | 'light'

type ChatVariant = 'ai' | 'user'

type ChatMessage = {
  id: string
  variant: ChatVariant
  content: string
  timestamp: string
}

interface ChatTheme {
  background: string
  panelBg: string
  aiLine: string
  userLine: string
  timestampAi: string
  timestampUser: string
  messageAiText: string
  messageUserText: string
  messageBg: string
  statusSecondary: string
  inputBg: string
  inputFg: string
  inputFocusedBg: string
  inputFocusedFg: string
  inputPlaceholder: string
  cursor: string
  statusAccent: string
}

const DEFAULT_CHAT_THEMES: Record<ThemeName, ChatTheme> = {
  dark: {
    background: '#050607',
    panelBg: '#101218',
    aiLine: '#34d399',
    userLine: '#38bdf8',
    timestampAi: '#4ade80',
    timestampUser: '#60a5fa',
    messageAiText: '#f1f5f9',
    messageUserText: '#dbeafe',
    messageBg: '#111823',
    statusSecondary: '#a3aed0',
    inputBg: '#050607',
    inputFg: '#f5f5f5',
    inputFocusedBg: '#0f1115',
    inputFocusedFg: '#ffffff',
    inputPlaceholder: '#a3a3a3',
    cursor: '#22c55e',
    statusAccent: '#facc15',
  },
  light: {
    background: '#f4f4f5',
    panelBg: '#ffffff',
    aiLine: '#16a34a',
    userLine: '#2563eb',
    timestampAi: '#15803d',
    timestampUser: '#1d4ed8',
    messageAiText: '#0f172a',
    messageUserText: '#111827',
    messageBg: '#f8fafc',
    statusSecondary: '#6b7280',
    inputBg: '#f4f4f5',
    inputFg: '#262626',
    inputFocusedBg: '#e7e7e8',
    inputFocusedFg: '#171717',
    inputPlaceholder: '#64748b',
    cursor: '#2563eb',
    statusAccent: '#f97316',
  },
}

const chatThemes = DEFAULT_CHAT_THEMES

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

const detectSystemTheme = (): ThemeName => {
  return 'dark'
} // Screen size thresholds (adjustable) - single source of truth
const SCREEN_THRESHOLDS = {
  WIDTH_CUTOFF: 70, // Below this is narrow, at/above is wide
  HEIGHT_CUTOFF: 30, // Below this is short, at/above is tall
} as const

type ScreenMode = 'full-screen' | 'wide-screen' | 'tall-screen' | 'small-screen'

function detectScreenMode(width: number, height: number): ScreenMode {
  const isWide = width >= SCREEN_THRESHOLDS.WIDTH_CUTOFF
  const isTall = height >= SCREEN_THRESHOLDS.HEIGHT_CUTOFF

  if (isWide && isTall) {
    return 'full-screen'
  } else if (isTall) {
    return 'tall-screen'
  } else if (isWide) {
    return 'wide-screen'
  } else {
    return 'small-screen'
  }
}

function formatTimestamp(date = new Date()): string {
  if (timestampFormatter) {
    return timestampFormatter.format(date)
  }
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const App = () => {
  const renderer = useRenderer()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const inputRef = useRef<InputRenderable | null>(null)
  const [inputRenderable, setInputRenderable] =
    useState<InputRenderable | null>(null)
  const [inputWidth, setInputWidth] = useState<number>(0)
  const autoScrollEnabledRef = useRef<boolean>(true)
  const programmaticScrollRef = useRef<boolean>(false)
  const isAtTopRef = useRef<boolean>(false)
  const previousScrollPositionRef = useRef<number>(0)

  const [themeName] = useState<ThemeName>(() => detectSystemTheme())
  const theme = chatThemes[themeName]

  const [inputValue, setInputValue] = useState<string>('')
  const [inputFocused, setInputFocused] = useState<boolean>(true)
  const [screenMode, setScreenMode] = useState<ScreenMode>('full-screen')

  // Mock todo items with clickable toggle
  const [completedTodos, setCompletedTodos] = useState<Set<number>>(new Set())

  const baseTodoItems = [
    { id: 1, text: 'Fix authentication bug in login flow' },
    { id: 2, text: 'Add unit tests for user service' },
    { id: 3, text: 'Refactor database connection pool' },
    { id: 4, text: 'Update documentation for API endpoints' },
    { id: 5, text: 'Review pull request #247' },
    { id: 6, text: 'Implement logging middleware for API requests' },
    { id: 7, text: 'Optimize image loading strategy for the web client' },
    { id: 8, text: 'Set up continuous integration pipeline with GitHub Actions' },
    { id: 9, text: 'Create unit tests for chat renderer hooks' },
    { id: 10, text: 'Fix scrollbar flickering issue during resize event' },
    { id: 11, text: 'Add keyboard shortcuts for toggling themes' },
    { id: 12, text: 'Refactor error boundary handling in Chat component' },
    { id: 13, text: 'Improve markdown rendering performance' },
    { id: 14, text: 'Implement input validation for multiline messages' },
    { id: 15, text: 'Add analytics tracking for user interactions' },
    { id: 16, text: 'Test scrolling behavior on small screens' },
    { id: 17, text: 'Implement mock API for offline mode' },
    { id: 18, text: 'Design new color theme for light mode contrast review' },
    { id: 19, text: 'Audit accessibility compliance for CLI interface' },
    { id: 20, text: 'Add detailed release notes automation to CI/CD' },
  ]

  const todoItems = baseTodoItems.map((item) => ({
    ...item,
    completed: completedTodos.has(item.id),
  }))

  const handleTodoToggle = useCallback((todoId: number, e?: any) => {
    if (e && e.stopPropagation) {
      e.stopPropagation()
    }

    setCompletedTodos((prev) => {
      const next = new Set(prev)
      if (next.has(todoId)) {
        next.delete(todoId)
      } else {
        next.add(todoId)
      }
      return next
    })
  }, [])

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'ai-seed-1',
      variant: 'ai',
      content:
        "What about adding some unit tests?\n\nHere's a comprehensive testing strategy:\n\n## Testing Approach\n\n1. **Unit Tests**: Test individual functions\n2. **Integration Tests**: Test component interactions\n3. **E2E Tests**: Test full user flows\n\n### Example Test\n\n```typescript\nimport { test, expect } from 'bun:test'\n\ntest('formatTimestamp returns correct format', () => {\n  const result = formatTimestamp()\n  expect(result).toMatch(/\\d{1,2}:\\d{2}/)\n})\n```\n\nThis approach ensures **comprehensive coverage** while maintaining _fast execution times_.",
      timestamp: formatTimestamp(),
    },
  ])

  const handleInputRef = useCallback((instance: InputRenderable | null) => {
    inputRef.current = instance
    setInputRenderable(instance)
    if (instance) {
      setInputWidth(Math.max(0, instance.width))
    }
  }, [])

  useEffect(() => {
    renderer?.setBackgroundColor(theme.background)
    if (renderer) {
      setScreenMode(detectScreenMode(renderer.width, renderer.height))
    }
  }, [renderer, theme.background])

  useEffect(() => {
    if (!renderer) return

    const handleResize = () => {
      setScreenMode(detectScreenMode(renderer.width, renderer.height))
    }

    renderer.on('resize', handleResize)
    return () => {
      renderer.off('resize', handleResize)
    }
  }, [renderer])

  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox) return

    const handleScrollChange = () => {
      const rawPosition = scrollbox.verticalScrollBar.scrollPosition
      const previous = previousScrollPositionRef.current

      // If we were at 0 and are still at or below 0, ignore this event entirely
      if (previous <= 0 && rawPosition <= 0 && isAtTopRef.current) {
        return
      }

      const current = Math.max(0, rawPosition) // Clamp to prevent negative values

      const maxScroll = Math.max(
        0,
        scrollbox.scrollHeight - scrollbox.viewport.height,
      )
      const isNearBottom = Math.abs(maxScroll - current) <= 1
      const isAtTop = current === 0

      if (programmaticScrollRef.current) {
        programmaticScrollRef.current = false
        autoScrollEnabledRef.current = true
        isAtTopRef.current = false
        previousScrollPositionRef.current = current
        return
      }

      // If we just reached the top, flag it and stop auto-scroll
      if (isAtTop) {
        isAtTopRef.current = true
        autoScrollEnabledRef.current = false
        previousScrollPositionRef.current = current
        return
      }

      // If we moved away from the top, reset the flag
      if (isAtTopRef.current && current > 0) {
        isAtTopRef.current = false
      }

      previousScrollPositionRef.current = current
      autoScrollEnabledRef.current = isNearBottom
    }

    scrollbox.verticalScrollBar.on('change', handleScrollChange)

    return () => {
      scrollbox.verticalScrollBar.off('change', handleScrollChange)
    }
  }, [])

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

  const scrollToLatest = useCallback(() => {
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
      const maxScroll = Math.max(
        0,
        scrollbox.scrollHeight - scrollbox.viewport.height,
      )

      if (scrollbox.scrollTop > maxScroll) {
        scrollbox.scrollTop = maxScroll
      } else if (autoScrollEnabledRef.current) {
        scrollToLatest()
      }
    }
  }, [messages, scrollToLatest])

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return

    setInputValue('')

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      variant: 'user',
      content: trimmed,
      timestamp: formatTimestamp(),
    }

    const aiMessageId = `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const aiMessage: ChatMessage = {
      id: aiMessageId,
      variant: 'ai',
      content: '',
      timestamp: formatTimestamp(),
    }

    setMessages((prev) => {
      const newMessages = [...prev, userMessage, aiMessage]
      if (newMessages.length > 100) {
        return newMessages.slice(-100)
      }
      return newMessages
    })
    setInputFocused(true)
    inputRef.current?.focus()

    // Simulate streaming response with markdown - token chunk by chunk
    const fullResponse = `I've reviewed your message. Let me help with that.

## Analysis

Based on your request, here are the key points:

1. **Architecture**: The current structure is well-organized
2. **Performance**: Consider adding memoization for expensive calculations
3. **Testing**: Add unit tests using \`bun:test\`

### Code Example

\`\`\`typescript
// Add this optimization
const memoized = useMemo(() => {
  return expensiveCalculation(data)
}, [data])
\`\`\`

This approach will improve _performance_ while maintaining **code clarity**.`

    // Split into random-sized chunks to simulate token streaming
    const chunks: string[] = []
    let pos = 0
    while (pos < fullResponse.length) {
      // Random chunk size between 1-8 characters
      const chunkSize = Math.floor(Math.random() * 8) + 1
      chunks.push(fullResponse.slice(pos, pos + chunkSize))
      pos += chunkSize
    }

    let index = 0
    const interval = setInterval(() => {
      if (index >= chunks.length) {
        clearInterval(interval)
        return
      }

      const chunk = chunks[index]
      index++

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMessageId
            ? { ...msg, content: msg.content + chunk }
            : msg,
        ),
      )
    }, 50)
  }, [inputValue])

  const messageItems = useMemo(() => {
    const availableWidth = renderer?.width ?? 80

    return messages.map((message, index) => {
      const isAi = message.variant === 'ai'
      const lineColor = isAi ? theme.aiLine : theme.userLine
      const textColor = isAi ? theme.messageAiText : theme.messageUserText
      const timestampColor = isAi ? theme.timestampAi : theme.timestampUser

      return (
        <box
          key={`${message.id}-${index}`}
          style={{ width: '100%', flexDirection: 'column', gap: 0 }}
        >
          <box
            style={{
              width: '100%',
              flexDirection: 'row',
              justifyContent: isAi ? 'flex-start' : 'flex-end',
            }}
          >
            <box
              style={{
                flexDirection: 'row',
                gap: isAi ? 0 : 1,
                alignItems: 'stretch',
                ...(isAi
                  ? { width: '100%', flexGrow: 1 }
                  : { maxWidth: '80%' }),
              }}
            >
              {isAi ? (
                <box
                  style={{
                    width: 1,
                    backgroundColor: lineColor,
                    marginTop: 1,
                    marginBottom: 1,
                  }}
                />
              ) : null}

              <box
                style={{
                  backgroundColor: theme.messageBg,
                  padding: 0,
                  paddingLeft: 1,
                  paddingRight: 1,
                  paddingTop: isAi ? 0 : 0,
                  paddingBottom: isAi ? 0 : 0,
                  gap: 0,
                  shouldFill: isAi,
                  ...(isAi
                    ? { width: '100%', flexGrow: 1, justifyContent: 'center' }
                    : {}),
                }}
              >
                <text
                  content={`[${message.timestamp}]`}
                  wrap={false}
                  attributes={TextAttributes.DIM}
                  style={{
                    fg: timestampColor,
                    marginTop: isAi ? 1 : 0,
                    marginBottom: isAi ? 0 : 0,
                    alignSelf: isAi ? 'flex-start' : 'flex-end',
                  }}
                />
                <text
                  wrap
                  style={{
                    fg: textColor,
                    marginTop: isAi ? 0 : 0,
                    marginBottom: isAi ? 1 : 0,
                  }}
                >
                  {isAi && hasMarkdown(message.content)
                    ? renderMarkdown(message.content)
                    : message.content}
                </text>
              </box>
            </box>
          </box>
        </box>
      )
    })
  }, [messages, renderer?.width, theme])

  const fallbackInputWidth = Math.max(4, renderer.width - 6)
  const effectiveInputWidth = inputWidth > 0 ? inputWidth : fallbackInputWidth
  const maxCharsPerLine = Math.max(1, effectiveInputWidth - 2) // Account for padding

  // Calculate actual line count by splitting on newlines and word-wrapping each line
  const lines = inputValue.split('\n')
  let totalLineCount = 0
  for (const line of lines) {
    if (line.length === 0) {
      totalLineCount += 1
    } else {
      // Count wrapped lines for this line
      totalLineCount += Math.ceil(line.length / maxCharsPerLine)
    }
  }

  const computedLineCount = Math.max(1, totalLineCount)
  const maxInputHeight = 5
  const inputHeight = Math.max(1, Math.min(computedLineCount, maxInputHeight))

  const screenModeLabels: Record<ScreenMode, string> = {
    'full-screen': '🖥️  Full Screen Mode',
    'wide-screen': '↔️  Wide Screen Mode',
    'tall-screen': '↕️  Tall Screen Mode',
    'small-screen': '📱 Small Screen Mode',
  }

  const todoListPosition: 'top' | 'right' | 'hidden' =
    screenMode === 'tall-screen' || screenMode === 'small-screen'
      ? 'top'
      : 'right'

  // Todo list always on the right side
  const todoMaxWidth = Math.floor(renderer.width / 3)
  const todoWidth = todoMaxWidth

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
      {/* Screen mode banner / Todo list for tall screens */}
      {todoListPosition === 'top' ? (
        <box
          style={{
            width: '100%',
            backgroundColor: theme.panelBg,
            paddingLeft: 1,
            paddingRight: 1,
            paddingTop: 1,
            flexShrink: 0,
          }}
        >
          <box
            style={{
              flexDirection: 'column',
              gap: 0,
              backgroundColor: theme.messageBg,
              paddingLeft: 1,
              paddingRight: 1,
              paddingTop: 1,
              maxHeight: Math.floor(renderer.height / 3),
            }}
          >
            <text
              content="📝 TODO"
              wrap={false}
              style={{
                fg: theme.statusAccent,
                marginBottom: screenMode === 'small-screen' ? 0 : 1,
              }}
              attributes={TextAttributes.BOLD}
            />
            <scrollbox
              scrollX={false}
              scrollbarOptions={{ visible: false }}
              style={{
                flexGrow: 1,
                rootOptions: {
                  flexGrow: 1,
                  padding: 0,
                  paddingBottom: 0,
                  gap: 0,
                  flexDirection: 'column',
                },
                wrapperOptions: {
                  flexGrow: 1,
                  border: false,
                  padding: 0,
                  paddingBottom: 0,
                },
                contentOptions: {
                  flexDirection: 'column',
                  gap: 0,
                  padding: 0,
                  paddingBottom: 0,
                },
              }}
            >
              {todoItems.map((item, index) => (
                <box
                  key={`todo-banner-${item.id}-${index}`}
                  onMouseDown={(e: any) => handleTodoToggle(item.id, e)}
                  style={{
                    flexDirection: 'row',
                    flexShrink: 0,
                  }}
                >
                  <text
                    content={`${item.completed ? '✓' : '○'} ${item.text}`}
                    wrap
                    style={{
                      fg: item.completed
                        ? theme.statusSecondary
                        : theme.messageAiText,
                      ...(item.completed && {
                        attributes: TextAttributes.DIM,
                      }),
                    }}
                  />
                </box>
              ))}
            </scrollbox>
          </box>
        </box>
      ) : (
        <box></box>
      )}

      <box
        style={{
          flexDirection: 'row',
          flexGrow: 1,
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 0,
          paddingBottom: 1,
          backgroundColor: theme.panelBg,
          gap: 1,
        }}
      >
        {/* Main chat area */}
        <box
          style={{
            flexDirection: 'column',
            flexGrow: 1,
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
                gap: 1,
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

        {todoListPosition === 'right' && (
          <box
            style={{
              flexDirection: 'column',
              width: todoWidth,
              flexShrink: 0,
              backgroundColor: theme.panelBg,
            }}
          >
            <box
              style={{
                flexDirection: 'column',
                gap: 0,
                backgroundColor: theme.messageBg,
                paddingLeft: 1,
                paddingRight: 1,
                paddingTop: 1,
                maxHeight: Math.floor(renderer.height / 3),
              }}
            >
              <text
                content="📝 TODO"
                wrap={false}
                style={{ fg: theme.statusAccent, marginBottom: 1 }}
                attributes={TextAttributes.BOLD}
              />
              <scrollbox
                scrollX={false}
                scrollbarOptions={{ visible: false }}
                style={{
                  flexGrow: 1,
                  rootOptions: {
                    flexGrow: 1,
                    padding: 0,
                    gap: 0,
                    flexDirection: 'column',
                  },
                  wrapperOptions: {
                    flexGrow: 1,
                    border: false,
                  },
                  contentOptions: {
                    flexDirection: 'column',
                    gap: 0,
                  },
                }}
              >
                {todoItems.map((item, index) => (
                  <box
                    key={`todo-side-${item.id}-${index}`}
                    onMouseDown={(e: any) => handleTodoToggle(item.id, e)}
                    style={{
                      flexDirection: 'row',
                      flexShrink: 0,
                    }}
                  >
                    <text
                      content={`${item.completed ? '✓' : '○'} ${item.text}`}
                      wrap
                      style={{
                        fg: item.completed
                          ? theme.statusSecondary
                          : theme.messageAiText,
                        ...(item.completed && {
                          attributes: TextAttributes.DIM,
                        }),
                      }}
                    />
                  </box>
                ))}
              </scrollbox>
            </box>
          </box>
        )}
      </box>

      {/* Fixed input region outside scrollbox */}
      <box
        style={{
          flexShrink: 0,
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: theme.panelBg,
        }}
      >
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

render(<App />)
