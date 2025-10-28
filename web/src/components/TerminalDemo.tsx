import { sleep } from '@codebuff/common/util/promise'
import { useMutation } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useTheme } from 'next-themes'
import posthog from 'posthog-js'
import React, { useState, useEffect, useRef } from 'react'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { match, P } from 'ts-pattern'

import Terminal, { ColorMode, TerminalOutput } from './ui/terminal'
import { cn } from '../lib/utils'

const FIX_BUG_FLAG = true

const POSSIBLE_FILES = [
  'web/src/components/ui/dialog.tsx',
  'web/src/components/ui/button.tsx',
  'web/src/components/ui/input.tsx',
  'web/src/components/ui/card.tsx',
  'web/src/components/ui/sheet.tsx',
  'web/src/lib/utils.ts',
  'web/src/lib/hooks.ts',
  'web/src/styles/globals.css',
  'web/tailwind.config.ts',
  'web/src/app/layout.tsx',
  'web/src/app/page.tsx',
  'web/src/components/navbar/navbar.tsx',
  'web/src/components/footer.tsx',
  'web/src/components/providers/theme-provider.tsx',
  'web/src/hooks/use-mobile.tsx',
  'web/src/hooks/use-theme.tsx',
  'common/src/util/string.ts',
  'common/src/util/array.ts',
  'common/src/util/file.ts',
  'common/src/constants.ts',
]

const getRandomFiles = (min: number = 2, max: number = 5) => {
  const count = Math.floor(Math.random() * (max - min + 1)) + min // Random number between min and max
  const shuffled = [...POSSIBLE_FILES].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, count)
}

type PreviewTheme = 'default' | 'terminal-y' | 'retro' | 'light'

interface BrowserPreviewProps {
  content: string
  showError?: boolean
  isRainbow?: boolean
  theme?: PreviewTheme
  isLoading?: boolean
}

const getIframeContent = (
  content: string,
  showError: boolean,
  isRainbow: boolean,
  theme: PreviewTheme,
) => {
  const styles = `
    <style>
      body {
        margin: 0;
        padding: 16px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 14px;
        ${
          theme === 'light'
            ? `
          background: white;
          color: #111827;
        `
            : theme === 'terminal-y'
              ? `
          background: black;
          color: #10B981;
        `
              : theme === 'retro'
                ? `
          background: #002448;
          color: #FFB000;
          text-shadow: 2px 0 0 rgba(255,176,0,0.6);
          animation: textflicker 0.1s infinite;
        `
                : `
          background: transparent;
          color: inherit;
        `
        }
      }
      @keyframes textflicker {
        0% { opacity: 0.95; text-shadow: 2px 0 0 rgba(255,176,0,0.6); }
        25% { opacity: 0.92; text-shadow: -2px 0 0 rgba(255,176,0,0.6); }
        50% { opacity: 0.94; text-shadow: 2px 0 0 rgba(255,176,0,0.6); }
        75% { opacity: 0.91; text-shadow: -2px 0 0 rgba(255,176,0,0.6); }
        100% { opacity: 0.95; text-shadow: 2px 0 0 rgba(255,176,0,0.6); }
      }
      .error { color: #EF4444; }
      .error-box {
        background: rgba(239,68,68,0.1);
        padding: 16px;
        border-radius: 6px;
        margin: 8px 0;
      }
      .success { color: #10B981; }
      h1 { font-size: 24px; margin-bottom: 16px; }
      p { margin: 8px 0; }
      .dim { opacity: 0.75; }
    </style>
  `

  const errorContent = `
    <div>
      <div style="margin-top: 32px; border: 2px dashed #EF4444; padding: 16px; border-radius: 8px;">
        <h2 class="error">🎭 Demo Error: Component failed to render</h2>
        <p class="dim" style="margin-top: 16px; font-style: italic;">💡 Tip: This is just a demo - not a real error!</p>
        <div class="error-box">
          <p>TypeError: Cannot read properties of undefined (reading 'greeting')</p>
          <p class="dim">at DemoComponent (./components/DemoComponent.tsx:12:23)</p>
          <p class="dim">at renderWithHooks (./node_modules/react-dom/cjs/react-dom.development.js:14985:18)</p>
        </div>
        <p class="dim">This is a simulated error in our demo component.</p>
        <p><b>Try typing "fix the bug" to resolve it!</b></p>
      </div>
    </div>
  `

  const fixedContent = `
    <h1>Hello World! 👋</h1>
    <p class="success">Everything is working perfectly now!</p>
    <p>Like the demo? Pls install Codebuff so we can justify keeping this demo pls:</p>
    <code><pre>npm install -g codebuff</pre></code>
    `

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
          tailwind.config = {
            theme: {
              extend: {
                colors: {
                  error: '#EF4444',
                  success: '#10B981',
                }
              }
            }
          }
        </script>
        ${styles}
      </head>
      <body>
        <div ${
          isRainbow
            ? `
          style="
            display: inline-block;
            padding: 16px;
            border-radius: 6px;
            background: linear-gradient(to right, rgba(239,68,68,0.9), rgba(168,85,247,0.9), rgba(59,130,246,0.9));
            color: white;
            box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.25);
          "
        `
            : ''
        }>
          ${content === 'fixed' ? fixedContent : content}
          ${showError ? errorContent : ''}
        </div>
      </body>
    </html>
  `
}

const BrowserPreview: React.FC<BrowserPreviewProps> = ({
  content,
  showError = false,
  isRainbow = false,
  theme = 'default',
  isLoading = false,
}) => {
  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden w-full flex flex-col min-h-[200px]',
      )}
    >
      <div className="rounded-lg bg-white dark:bg-gray-900 flex flex-col flex-1">
        {/* Browser-like title bar */}
        <div className="bg-gray-100 dark:bg-gray-800 p-2 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700">
          {/* Traffic light circles */}
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          {/* URL bar */}
          <div className="flex-1 ml-2">
            <div className="bg-white dark:bg-gray-700 rounded px-3 py-1 text-sm text-gray-600 dark:text-gray-300 font-mono">
              http://localhost:3000
            </div>
          </div>
        </div>
        {/* Content area */}
        <div
          className={cn(
            'flex-1 border rounded-b-lg border-gray-200 dark:border-gray-700 relative',
            theme === 'light' && 'bg-white',
            theme === 'terminal-y' && 'bg-black',
            theme === 'retro' && 'bg-[#002448]',
          )}
        >
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900 dark:border-gray-100"></div>
            </div>
          ) : (
            <iframe
              srcDoc={getIframeContent(content, showError, isRainbow, theme)}
              className="w-full h-full border-none"
              sandbox="allow-scripts"
            />
          )}
        </div>
      </div>
    </div>
  )
}

interface DemoResponse {
  html: string
  message: string
}

// Sample responses for various coding tasks
const SAMPLE_RESPONSES = {
  optimize: {
    message:
      "I've analyzed your codebase and found several opportunities for optimization. The main performance bottleneck is in your React component rendering cycle.",
    filesToUpdate: [
      'web/src/components/ui/data-table.tsx',
      'web/src/hooks/use-infinite-scroll.ts',
      'web/src/lib/performance-utils.ts',
    ],
    changes: [
      '- Added memoization to prevent unnecessary re-renders',
      '- Implemented virtualized list for large data sets',
      '- Optimized network request batching',
      '- Added debounce to expensive calculations',
    ],
  },
  refactor: {
    message:
      "I've examined your authentication flow and refactored it for better maintainability and security.",
    filesToUpdate: [
      'web/src/lib/auth.ts',
      'web/src/components/auth/login-form.tsx',
      'web/src/api/auth-service.ts',
    ],
    changes: [
      '- Separated authentication logic into reusable hooks',
      '- Improved error handling and user feedback',
      '- Enhanced security with proper token management',
      '- Simplified API request structure',
    ],
  },
  feature: {
    message:
      "I've implemented the dark mode toggle functionality across your application.",
    filesToUpdate: [
      'web/src/components/navbar/theme-switcher.tsx',
      'web/src/hooks/use-theme.tsx',
      'web/tailwind.config.ts',
      'web/src/styles/globals.css',
    ],
    changes: [
      '- Created ThemeSwitcher component with smooth transitions',
      '- Added local storage persistence for theme preference',
      '- Updated color scheme in Tailwind configuration',
      '- Ensured all components respect theme settings',
    ],
  },
  fix: {
    message: 'I found and fixed the memory leak in your React components.',
    filesToUpdate: [
      'web/src/components/dashboard/analytics-chart.tsx',
      'web/src/hooks/use-websocket.ts',
    ],
    changes: [
      '- Added proper cleanup in useEffect for event listeners',
      '- Fixed WebSocket connection closure on component unmount',
      '- Refactored expensive computation to avoid redundant work',
      '- Added safeguards for asynchronous state updates',
    ],
  },
}

// Interactive typing animation component
const TypingEffect = ({
  text,
  delay = 25,
  onComplete,
}: {
  text: string
  delay?: number
  onComplete?: () => void
}) => {
  const [displayText, setDisplayText] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayText((prev) => prev + text[currentIndex])
        setCurrentIndex((prevIndex) => prevIndex + 1)
      }, delay)

      return () => clearTimeout(timeout)
    } else if (onComplete) {
      onComplete()
    }
    return undefined
  }, [currentIndex, delay, text, onComplete])

  return (
    <span>
      {displayText}
      {currentIndex < text.length && <span className="animate-pulse">▌</span>}
    </span>
  )
}

const TerminalDemo = () => {
  const { theme: colorTheme } = useTheme()
  const [terminalLines, setTerminalLines] = useState<React.ReactNode[]>([
    <TerminalOutput key="welcome">
      <span className="text-green-400 font-bold">Codebuff CLI v1.5.0</span>
      <p>Interactive coding assistant that understands your entire codebase.</p>
      <p>
        Working directory:{' '}
        <span className="text-blue-400">/my-demo-project</span>
      </p>
      <p>
        Type <span className="text-yellow-400 font-bold">"help"</span> for a
        list of commands or try a natural language request.
      </p>
    </TerminalOutput>,
  ])
  const [previewContent, setPreviewContent] =
    useState<string>(`<div style="padding: 16px; border-radius: 8px;">
      <h1 class="text-xl font-bold">👋 Welcome to the Codebuff Demo!</h1>
      <p class="dim" style="margin-top: 16px;">Try these example prompts in the terminal:</p>
      <div style="margin: 16px 0; padding: 16px; background: rgba(59,130,246,0.1); border-radius: 8px;">
        <p>🚀 <b>"Optimize performance"</b> - Speed up your application</p>
        <p>🔄 <b>"Refactor auth flow"</b> - Improve code architecture</p>
        <p>🌙 <b>"Add dark mode"</b> - Implement new feature</p>
        <p>🐛 <b>"Fix memory leak"</b> - Resolve coding issues</p>
      </div>
      <p class="dim">Type <b>"help"</b> to see all available commands!</p>
      <div style="margin-top: 16px; padding: 8px; background: rgba(74,222,128,0.1); border-radius: 4px; border-left: 3px solid rgba(74,222,128,0.5);">
        <p style="font-style: italic; font-size: 0.9em;">This is just a demo. Install Codebuff to experience the full capabilities with your own projects!</p>
      </div>`)
  const [showError, setShowError] = useState(FIX_BUG_FLAG)

  const [isRainbow, setIsRainbow] = useState(false)
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>('default')
  const [messages, setMessages] = useState<string[]>([])
  const [autoTypeIndex, setAutoTypeIndex] = useState(0)
  const [isAutoTyping, setIsAutoTyping] = useState(false)
  const exampleCommands = useRef([
    'optimize performance',
    'fix memory leak',
    'refactor auth flow',
  ])
  const terminalRef = useRef<HTMLDivElement>(null)

  const demoMutation = useMutation<DemoResponse, Error, string>({
    mutationFn: async (input: string) => {
      const response = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: [...messages, input],
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again in a minute.')
        }
        throw new Error(error.error || 'Failed to get response')
      }

      return response.json()
    },
    onMutate: (input) => {
      // Track terminal input event
      posthog.capture(AnalyticsEvent.DEMO_TERMINAL_COMMAND_EXECUTED, {
        command: input,
      })

      const randomFiles = getRandomFiles()
      const newLines = [
        <TerminalOutput key={`ask-1-${Date.now()}`}>
          <p>
            {'> '}
            {input}
          </p>
        </TerminalOutput>,
        <TerminalOutput key={`files-${Date.now()}`}>
          <b className="text-green-400">Codebuff:</b> Reading additional
          files...
          {randomFiles.slice(0, 3).map((file) => (
            <p key={file} className="text-wrap">
              - {file}
            </p>
          ))}
          {randomFiles.length > 3 && (
            <p className="text-wrap">
              and {randomFiles.length - 3} more:{' '}
              {randomFiles.slice(3).join(', ')}
            </p>
          )}
        </TerminalOutput>,
        <TerminalOutput key={`ask-${Date.now()}`}>Thinking...</TerminalOutput>,
      ]
      setTerminalLines((prev) => [...prev, ...newLines])
    },
    onError: (error) => {
      setTerminalLines((prev) => [
        ...prev,
        <TerminalOutput key={`error-${Date.now()}`} className="text-red-500">
          {error.message}
        </TerminalOutput>,
      ])
    },
    onSuccess: async (data) => {
      setMessages((prev) => [...prev, data.message])
      const newLines = [
        <TerminalOutput key={`resp-1-${Date.now()}`}>
          {data.message}
        </TerminalOutput>,
        <TerminalOutput key={`resp-2-${Date.now()}`}>
          Applying file changes, please wait.
        </TerminalOutput>,
        <TerminalOutput key={`resp-3-${Date.now()}`}>
          <p className="text-green-400">- Updated web/src/app/page.tsx</p>
        </TerminalOutput>,
      ]
      setTerminalLines((prev) => [...prev, ...newLines])
      await sleep(1000) // Delay so the user has time to read the output
      setPreviewContent(data.html)
    },
  })

  // Auto demo typing effect
  useEffect(() => {
    if (!isAutoTyping) {
      const interval = setInterval(() => {
        if (Math.random() < 0.03) {
          // 3% chance to start auto-typing
          setIsAutoTyping(true)
          setAutoTypeIndex(
            Math.floor(Math.random() * exampleCommands.current.length),
          )
        }
      }, 5000)

      return () => clearInterval(interval)
    }
    return undefined
  }, [isAutoTyping])

  // Reset auto typing after completion
  const resetAutoTyping = () => {
    setTimeout(() => {
      setIsAutoTyping(false)
    }, 10000) // Wait 10 seconds before possibly triggering another demo
  }

  // Handle various input commands
  const handleInput = async (input: string) => {
    const cleanInput = input.trim().toLowerCase()

    // Add the user's command to the terminal
    setTerminalLines((prev) => [
      ...prev,
      <TerminalOutput key={`user-cmd-${Date.now()}`} className="text-wrap">
        {'>'} {input}
      </TerminalOutput>,
    ])

    match(cleanInput)
      .with('help', () => {
        posthog.capture(AnalyticsEvent.DEMO_TERMINAL_HELP_VIEWED)
        setTerminalLines((prev) => [
          ...prev,
          <TerminalOutput key={`help-${Date.now()}`}>
            <div className="bg-zinc-800/50 p-3 rounded-md border border-zinc-700/50 my-2">
              <p className="text-yellow-400 font-bold mb-2">
                CODEBUFF COMMANDS:
              </p>
              <p className="mb-1">
                • <span className="text-blue-400">"optimize performance"</span>{' '}
                - Speed up your application
              </p>
              <p className="mb-1">
                • <span className="text-blue-400">"refactor auth flow"</span> -
                Improve code organization
              </p>
              <p className="mb-1">
                • <span className="text-blue-400">"add dark mode"</span> -
                Implement a new feature
              </p>
              <p className="mb-1">
                • <span className="text-blue-400">"fix memory leak"</span> -
                Resolve coding issues
              </p>
              <p className="mb-1">
                • <span className="text-blue-400">"change theme"</span> - Change
                the preview theme
              </p>
              <p className="mt-3 text-green-400">
                ℹ️ This is a demo with limited functionality. Install Codebuff
                for full capabilities:
              </p>
              <p className="font-mono bg-black/30 p-2 rounded text-white/90 mt-1">
                npm install -g codebuff
              </p>
            </div>
          </TerminalOutput>,
        ])
      })
      .with(
        P.string.includes('optimize'),
        P.string.includes('performance'),
        () => {
          posthog.capture(AnalyticsEvent.DEMO_TERMINAL_OPTIMIZE_REQUESTED)
          const response = SAMPLE_RESPONSES.optimize

          setTerminalLines((prev) => [
            ...prev,
            <TerminalOutput key={`analyze-${Date.now()}`}>
              <p className="text-blue-400">
                🔍 Analyzing codebase for performance bottlenecks...
              </p>
              <div className="text-xs text-white/60 pl-4 mb-3 mt-1">
                {getRandomFiles(4, 7).map((file, i) => (
                  <motion.p
                    key={file}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.15 }}
                  >
                    Scanning {file}...
                  </motion.p>
                ))}
              </div>
            </TerminalOutput>,
            <TerminalOutput key={`optimize-response-${Date.now()}`}>
              <div className="my-2">
                <p className="text-green-400 font-bold mb-2">
                  ✅ Analysis complete
                </p>
                <p className="mb-2">{response.message}</p>

                <p className="text-yellow-400 mt-4 mb-1">Files to update:</p>
                {response.filesToUpdate.map((file) => (
                  <p key={file} className="text-white/80 text-sm pl-2">
                    ● {file}
                  </p>
                ))}

                <p className="text-yellow-400 mt-4 mb-1">Changes to apply:</p>
                {response.changes.map((change) => (
                  <p key={change} className="text-green-400 text-sm pl-2">
                    {change}
                  </p>
                ))}

                <p className="mt-4">Applying changes to 3 files...</p>
                <p className="text-green-400 mt-1">
                  ✓ Performance optimizations applied successfully!
                </p>
                <p className="text-white/60 text-sm italic mt-2">
                  Note: Your application should now be approximately 43% faster.
                </p>
              </div>
            </TerminalOutput>,
          ])

          // Update the preview after the "changes"
          setTimeout(() => {
            setPreviewContent(`<div style="padding: 16px; border-radius: 8px;">
              <h1 class="text-xl font-bold">⚡ Performance Optimized!</h1>
              <div style="padding: 12px; background: rgba(74,222,128,0.1); border-radius: 6px; margin: 16px 0; border-left: 3px solid rgba(74,222,128,0.6);">
                <p>✅ Memoized component rendering</p>
                <p>✅ Implemented virtualized lists</p>
                <p>✅ Optimized API request batching</p>
                <p>✅ Reduced unnecessary re-renders</p>
              </div>
              <div style="display: flex; justify-content: space-between; margin-top: 16px;">
                <div>
                  <p style="font-weight: bold;">Before:</p>
                  <p>Loading time: 1200ms</p>
                  <p>Memory usage: 78MB</p>
                </div>
                <div>
                  <p style="font-weight: bold; color: #10B981;">After:</p>
                  <p style="color: #10B981;">Loading time: 680ms</p>
                  <p style="color: #10B981;">Memory usage: 42MB</p>
                </div>
              </div>
            </div>`)
          }, 2000)
        },
      )
      .with(
        P.when(
          (s: string) =>
            s.includes('fix') && (s.includes('memory') || s.includes('leak')),
        ),
        () => {
          posthog.capture(AnalyticsEvent.DEMO_TERMINAL_FIX_MEMORY_LEAK)
          setShowError(false)
          const response = SAMPLE_RESPONSES.fix

          setTerminalLines((prev) => [
            ...prev,
            <TerminalOutput key={`analyze-${Date.now()}`}>
              <p className="text-blue-400">
                🔍 Scanning components for memory leaks...
              </p>
              <div className="text-xs text-white/60 pl-4 mb-3 mt-1">
                {getRandomFiles(3, 5).map((file, i) => (
                  <motion.p
                    key={file}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.15 }}
                  >
                    Analyzing {file}...
                  </motion.p>
                ))}
              </div>
              <p className="text-red-400">
                ⚠️ Found 3 potential memory leaks in React components
              </p>
            </TerminalOutput>,
            <TerminalOutput key={`fix-response-${Date.now()}`}>
              <div className="my-2">
                <p className="mb-2">{response.message}</p>

                <p className="text-yellow-400 mt-4 mb-1">Problem areas:</p>
                {response.filesToUpdate.map((file, i) => (
                  <div key={file} className="pl-2 mb-2">
                    <p className="text-white/80">● {file}</p>
                    <p className="text-red-400/80 text-xs pl-4">
                      {i === 0
                        ? 'Missing cleanup in useEffect hook'
                        : 'Incomplete resource cleanup'}
                    </p>
                  </div>
                ))}

                <p className="text-yellow-400 mt-4 mb-1">Applied fixes:</p>
                {response.changes.map((change) => (
                  <p key={change} className="text-green-400 text-sm pl-2">
                    {change}
                  </p>
                ))}

                <p className="mt-4">Applying changes...</p>
                <p className="text-green-400 mt-1">
                  ✓ Memory leaks fixed successfully!
                </p>
                <p className="text-white/60 text-sm italic mt-2">
                  Memory profile before: 156MB, after: 92MB
                </p>
              </div>
            </TerminalOutput>,
          ])

          // Update the preview after the "changes"
          setTimeout(() => {
            setPreviewContent(`<div style="padding: 16px; border-radius: 8px;">
              <h1 class="text-xl font-bold">🔧 Memory Leaks Fixed!</h1>
              <div style="padding: 12px; background: rgba(74,222,128,0.1); border-radius: 6px; margin: 16px 0; border-left: 3px solid rgba(74,222,128,0.6);">
                <p>✅ Proper useEffect cleanups added</p>
                <p>✅ WebSocket connections properly closed</p>
                <p>✅ Event listener memory leaks resolved</p>
                <p>✅ Async state updates protected</p>
              </div>
              <div style="margin-top: 20px; border: 1px dashed #10B981; padding: 12px; border-radius: 6px;">
                <p style="font-style: italic; font-size: 0.9em;">Memory Usage:</p>
                <div style="height: 24px; width: 100%; background: #374151; border-radius: 4px; overflow: hidden; margin-top: 8px; position: relative;">
                  <div style="position: absolute; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; color: white; font-size: 14px;">
                    41% Reduction
                  </div>
                  <div style="height: 100%; width: 59%; background: linear-gradient(to right, #10B981, #34D399);"></div>
                </div>
              </div>
            </div>`)
          }, 2000)

          setPreviewTheme('default')
        },
      )
      .with(
        P.when((s: string) => s.includes('refactor') && s.includes('auth')),
        () => {
          posthog.capture(AnalyticsEvent.DEMO_TERMINAL_REFACTOR_REQUESTED)
          const response = SAMPLE_RESPONSES.refactor

          setTerminalLines((prev) => [
            ...prev,
            <TerminalOutput key={`analyze-${Date.now()}`}>
              <p className="text-blue-400">
                🔍 Analyzing authentication code architecture...
              </p>
              <div className="text-xs text-white/60 pl-4 mb-3 mt-1">
                {getRandomFiles(3, 6).map((file, i) => (
                  <motion.p
                    key={file}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.15 }}
                  >
                    Examining {file}...
                  </motion.p>
                ))}
              </div>
              <p className="text-yellow-400">
                ⚠️ Found authentication code with high technical debt
              </p>
            </TerminalOutput>,
            <TerminalOutput key={`refactor-response-${Date.now()}`}>
              <div className="my-2">
                <p className="mb-2">{response.message}</p>

                <p className="text-yellow-400 mt-4 mb-1">Files refactored:</p>
                {response.filesToUpdate.map((file) => (
                  <p key={file} className="text-white/80 text-sm pl-2">
                    ● {file}
                  </p>
                ))}

                <p className="text-yellow-400 mt-4 mb-1">
                  Architecture improvements:
                </p>
                {response.changes.map((change) => (
                  <p key={change} className="text-green-400 text-sm pl-2">
                    {change}
                  </p>
                ))}

                <p className="mt-4">Applying refactoring changes...</p>
                <p className="text-green-400 mt-1">
                  ✓ Authentication flow refactored successfully!
                </p>
                <p className="text-white/60 text-sm italic mt-2">
                  Code complexity reduced by 32%
                </p>
              </div>
            </TerminalOutput>,
          ])

          // Update the preview after the "changes"
          setTimeout(() => {
            setPreviewContent(`<div style="padding: 16px; border-radius: 8px;">
              <h1 class="text-xl font-bold">🔄 Authentication Flow Refactored</h1>
              <div style="padding: 12px; background: rgba(59,130,246,0.1); border-radius: 6px; margin: 16px 0; border-left: 3px solid rgba(59,130,246,0.6);">
                <p>✅ Improved code organization</p>
                <p>✅ Enhanced error handling</p>
                <p>✅ Better security practices</p>
                <p>✅ More maintainable structure</p>
              </div>
              <div style="margin-top: 20px; display: flex; justify-content: space-between;">
                <div style="width: 48%;">
                  <p style="font-weight: bold; margin-bottom: 8px;">Before:</p>
                  <div style="background: #1F2937; border-radius: 4px; padding: 8px; font-family: monospace; font-size: 12px;">
                    <p style="color: #9CA3AF; margin: 0;">// Mixed concerns</p>
                    <p style="color: #D1D5DB; margin: 0;">function login(user, pass) {</p>
                    <p style="color: #D1D5DB; margin: 0; padding-left: 12px;">validateUser();</p>
                    <p style="color: #D1D5DB; margin: 0; padding-left: 12px;">makeAPICall();</p>
                    <p style="color: #D1D5DB; margin: 0; padding-left: 12px;">handleErrors();</p>
                    <p style="color: #D1D5DB; margin: 0; padding-left: 12px;">updateUIState();</p>
                    <p style="color: #D1D5DB; margin: 0;">}</p>
                  </div>
                </div>
                <div style="width: 48%;">
                  <p style="font-weight: bold; color: #10B981;">After:</p>
                  <div style="background: #1F2937; border-radius: 4px; padding: 8px; font-family: monospace; font-size: 12px;">
                    <p style="color: #9CA3AF; margin: 0;">// Separated concerns</p>
                    <p style="color: #D1D5DB; margin: 0;">function useAuth() {</p>
                    <p style="color: #D1D5DB; margin: 0; padding-left: 12px;">const login = async () => {</p>
                    <p style="color: #D1D5DB; margin: 0; padding-left: 24px;">try {</p>
                    <p style="color: #10B981; margin: 0; padding-left: 36px;">// Clean implementation</p>
                    <p style="color: #D1D5DB; margin: 0; padding-left: 24px;">}</p>
                    <p style="color: #D1D5DB; margin: 0; padding-left: 12px;">}</p>
                    <p style="color: #D1D5DB; margin: 0;">}</p>
                  </div>
                </div>
              </div>
            </div>`)
          }, 2000)
        },
      )
      .with(
        P.when(
          (s: string) =>
            (s.includes('dark') || s.includes('light')) && s.includes('mode'),
        ),
        () => {
          posthog.capture(AnalyticsEvent.DEMO_TERMINAL_FEATURE_REQUESTED)
          const response = SAMPLE_RESPONSES.feature

          setTerminalLines((prev) => [
            ...prev,
            <TerminalOutput key={`analyze-${Date.now()}`}>
              <p className="text-blue-400">
                🔍 Scanning application for theme implementation...
              </p>
              <div className="text-xs text-white/60 pl-4 mb-3 mt-1">
                {getRandomFiles(4, 6).map((file, i) => (
                  <motion.p
                    key={file}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.15 }}
                  >
                    Examining {file}...
                  </motion.p>
                ))}
              </div>
            </TerminalOutput>,
            <TerminalOutput key={`feature-response-${Date.now()}`}>
              <div className="my-2">
                <p className="mb-2">{response.message}</p>

                <p className="text-yellow-400 mt-4 mb-1">Files updated:</p>
                {response.filesToUpdate.map((file) => (
                  <p key={file} className="text-white/80 text-sm pl-2">
                    ● {file}
                  </p>
                ))}

                <p className="text-yellow-400 mt-4 mb-1">
                  Implementation details:
                </p>
                {response.changes.map((change) => (
                  <p key={change} className="text-green-400 text-sm pl-2">
                    {change}
                  </p>
                ))}

                <p className="mt-4">Applying feature changes...</p>
                <p className="text-green-400 mt-1">
                  ✓ Dark mode toggle implemented successfully!
                </p>
                <p className="text-white/60 text-sm italic mt-2">
                  Feature is now available across all application pages
                </p>
              </div>
            </TerminalOutput>,
          ])

          // Toggle the theme to show the feature
          const nextTheme = previewTheme === 'default' ? 'retro' : 'default'
          setPreviewTheme(nextTheme)

          // Update the preview after the "changes"
          setTimeout(() => {
            setPreviewContent(`<div style="padding: 16px; border-radius: 8px;">
              <h1 class="text-xl font-bold">🌙 Dark Mode Implemented!</h1>
              <div style="margin: 16px 0; padding: 12px; background: ${previewTheme === 'default' ? 'rgba(59,130,246,0.1)' : 'rgba(234,179,8,0.1)'}; border-radius: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                  <span style="font-weight: bold;">Toggle Theme:</span>
                  <div style="width: 48px; height: 24px; background: ${previewTheme === 'default' ? '#1F2937' : '#FFB000'}; border-radius: 12px; position: relative; cursor: pointer;">
                    <div style="position: absolute; width: 20px; height: 20px; border-radius: 50%; background: white; top: 2px; ${previewTheme === 'default' ? 'right: 2px' : 'left: 2px'}; transition: all 0.3s;"></div>
                  </div>
                </div>
                <p>✅ Theme switcher component added</p>
                <p>✅ User preference persisted</p>
                <p>✅ System preference detection</p>
                <p>✅ Smooth theme transitions</p>
              </div>
              <div style="margin-top: 16px; font-family: monospace; font-size: 14px; background: #1F2937; color: #D1D5DB; padding: 12px; border-radius: 6px;">
                <p style="margin: 0;">const [theme, setTheme] = useState('light');</p>
                <p style="margin: 0;">useEffect(() => {</p>
                <p style="margin: 0; padding-left: 16px;">document.documentElement.classList.toggle(</p>
                <p style="margin: 0; padding-left: 32px;">'dark', theme === 'dark'</p>
                <p style="margin: 0; padding-left: 16px;">);</p>
                <p style="margin: 0;">}, [theme]);</p>
              </div>
            </div>`)
          }, 2000)
        },
      )
      .with('change theme', () => {
        const themes: PreviewTheme[] = ['terminal-y', 'retro', 'light']
        const currentIndex = themes.indexOf(previewTheme)
        const nextTheme = themes[(currentIndex + 1) % themes.length]

        posthog.capture(AnalyticsEvent.DEMO_TERMINAL_THEME_CHANGED, {
          from: previewTheme,
          to: nextTheme,
        })
        setPreviewTheme(nextTheme)

        setTerminalLines((prev) => [
          ...prev,
          <TerminalOutput key={`theme-preamble-${Date.now()}`}>
            <div className="my-2">
              <p className="text-blue-400">
                Changing theme to <span className="font-bold">{nextTheme}</span>{' '}
                mode...
              </p>
              <p className="text-green-400 mt-2">
                ✓ Theme updated successfully!
              </p>
            </div>
          </TerminalOutput>,
        ])
      })
      .with('clear', () => {
        setTerminalLines([
          <TerminalOutput key="welcome-again">
            <span className="text-green-400 font-bold">
              Codebuff CLI v1.5.0
            </span>
            <p>
              Terminal cleared. Type{' '}
              <span className="text-yellow-400 font-bold">"help"</span> for
              available commands.
            </p>
          </TerminalOutput>,
        ])
      })
      .otherwise(() => {
        // For other commands, show a custom response
        setTerminalLines((prev) => [
          ...prev,
          <TerminalOutput key={`analyze-${Date.now()}`}>
            <p className="text-blue-400">
              🔍 Analyzing request and searching codebase...
            </p>
            <div className="text-xs text-white/60 pl-4 mb-3 mt-1">
              {getRandomFiles(2, 4).map((file, i) => (
                <motion.p
                  key={file}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.15 }}
                >
                  Scanning {file}...
                </motion.p>
              ))}
            </div>
          </TerminalOutput>,
          <TerminalOutput key={`generic-response-${Date.now()}`}>
            <div className="my-2">
              <p className="text-yellow-400">This is a limited demo.</p>
              <p className="mb-2">Try one of these sample commands:</p>
              <ul className="list-disc pl-6 space-y-1 text-blue-400">
                <li>"optimize performance"</li>
                <li>"fix memory leak"</li>
                <li>"refactor auth flow"</li>
                <li>"add dark mode"</li>
                <li>"change theme"</li>
              </ul>
              <p className="text-white/60 text-sm italic mt-4">
                Install Codebuff to get the full experience with your own
                projects!
              </p>
              <p className="font-mono bg-black/30 p-2 rounded text-white/90 mt-2">
                npm install -g codebuff
              </p>
            </div>
          </TerminalOutput>,
        ])
      })
  }

  // Auto-typing effect to demonstrate commands
  useEffect(() => {
    if (isAutoTyping) {
      const commandToType = exampleCommands.current[autoTypeIndex]

      // Type the command with a delay
      const inputEl = document.querySelector('.terminal-input')
      if (inputEl) {
        let i = 0
        const typeInterval = setInterval(() => {
          if (i >= commandToType.length) {
            clearInterval(typeInterval)
            // Submit the command after typing
            setTimeout(() => {
              handleInput(commandToType)
              resetAutoTyping()
            }, 1000)
            return
          }

          // Add characters one by one
          ;(inputEl as HTMLElement).innerText = commandToType.substring(
            0,
            i + 1,
          )
          i++
        }, 150)

        return () => clearInterval(typeInterval)
      }
    }
    return undefined
  }, [isAutoTyping, autoTypeIndex])

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="w-full lg:w-1/2 h-full flex relative">
        <motion.div
          className="absolute -top-4 -left-4 lg:-left-6 z-10 bg-green-500 text-black text-xs font-bold px-3 py-1 rounded-full"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
        >
          Interactive Demo
        </motion.div>

        <div className="w-full text-sm" ref={terminalRef}>
          <div className="h-[250px] md:h-[400px] lg:h-[800px] relative">
            {/* Terminal container with custom border glow */}
            <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-green-500/20 to-green-300/20 p-[1px] pointer-events-none">
              <div className="absolute inset-0 rounded-lg bg-black" />
            </div>

            <Terminal
              name="Codebuff CLI"
              colorMode={ColorMode.Dark}
              onInput={(input) => {
                const cleanInput = input.trim()
                // Stop auto typing when user types
                if (isAutoTyping) {
                  setIsAutoTyping(false)
                }
                handleInput(cleanInput)
              }}
              scrollToPosition={true}
              prompt="> "
            >
              <div
                className={cn(
                  'flex flex-col text-sm whitespace-pre-wrap',
                  demoMutation.isPending && 'opacity-50',
                )}
              >
                {terminalLines}

                {/* Auto-typing hint */}
                {!isAutoTyping && terminalLines.length < 3 && (
                  <motion.div
                    className="mt-4 text-xs text-gray-400 italic"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 2 }}
                  >
                    Try typing{' '}
                    <span className="text-blue-400">
                      "optimize performance"
                    </span>{' '}
                    or <span className="text-blue-400">"help"</span>
                  </motion.div>
                )}
              </div>
            </Terminal>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 h-[250px] md:h-[400px] lg:h-[800px] flex relative">
        <motion.div
          className="absolute -top-4 -right-4 lg:-right-6 z-10 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
        >
          Live Preview
        </motion.div>

        {/* Browser preview with enhanced border */}
        <div className="relative w-full overflow-hidden">
          <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 p-[1px] pointer-events-none">
            <div className="absolute inset-0 rounded-lg bg-black" />
          </div>

          <BrowserPreview
            content={previewContent}
            showError={showError}
            isRainbow={isRainbow}
            theme={previewTheme}
            isLoading={demoMutation.isPending}
          />
        </div>
      </div>
    </div>
  )
}

export default TerminalDemo
