import React, { useState } from 'react'
import Terminal, { ColorMode, TerminalOutput } from './ui/terminal'
import { useIsMobile } from '../hooks/use-mobile'
import { cn } from '../lib/utils'
import { sleep } from 'common/util/helpers'

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
  isRainbow?: boolean
  theme?: PreviewTheme
  isLoading?: boolean
}

const getIframeContent = (
  content: string,
  isRainbow: boolean,
  theme: PreviewTheme
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
    <div style="border: 2px dashed #EF4444; padding: 16px; border-radius: 8px;">
      <h1 class="error">🎭 Demo Error: Component failed to render</h1>
      <p class="dim" style="margin-top: 16px; font-style: italic;">💡 Tip: This is just a demo - not a real error!</p>
      <div class="error-box">
        <p>TypeError: Cannot read properties of undefined (reading 'greeting')</p>
        <p class="dim">at DemoComponent (./components/DemoComponent.tsx:12:23)</p>
        <p class="dim">at renderWithHooks (./node_modules/react-dom/cjs/react-dom.development.js:14985:18)</p>
      </div>
      <p class="dim">This is a simulated error in our demo component.
      <p><b>Try typing "fix the bug" to resolve it!</b></p>
    </div>
  `

  const fixedContent = `
    <h1>Hello World! 👋</h1>
    <p class="success">Everything is working perfectly now!</p>
    <p>Like the demo? Use it for real so we can justify this demo:</p>
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
          ${content === 'error' ? errorContent : content === 'fixed' ? fixedContent : content}
        </div>
      </body>
    </html>
  `
}

const BrowserPreview: React.FC<BrowserPreviewProps> = ({
  content,
  isRainbow = false,
  theme = 'default',
  isLoading = false,
}) => {
  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 w-full flex flex-col min-h-[200px]'
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
            theme === 'retro' && 'bg-[#002448]'
          )}
        >
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900 dark:border-gray-100"></div>
            </div>
          ) : (
            <iframe
              srcDoc={getIframeContent(content, isRainbow, theme)}
              className="w-full h-full border-none"
              sandbox="allow-scripts"
            />
          )}
        </div>
      </div>
    </div>
  )
}

const InteractiveTerminalDemo = () => {
  const [terminalLines, setTerminalLines] = useState<React.ReactNode[]>([
    <TerminalOutput key="welcome">
      Codebuff will read and write files in "/my-demo-project". Type "help" for
      a list of commands.
    </TerminalOutput>,
  ])
  const [previewContent, setPreviewContent] = useState<string>('error')
  const [isLoading, setIsLoading] = useState(false)
  const [isRainbow, setIsRainbow] = useState(false)
  const [theme, setTheme] = useState<PreviewTheme>('default')
  const [messages, setMessages] = useState<string[]>([])

  const handleInput = async (input: string) => {
    const newLines = [...terminalLines]

    if (input === 'help') {
      newLines.push(
        <TerminalOutput key={`help-${Date.now()}`} className="text-wrap">
          {'>'} help
        </TerminalOutput>,
        <TerminalOutput key={`help-${Date.now()}`}>
          <p>ASK CODEBUFF TO...</p>
          <p>• "fix the bug" - Fix a bug in the code</p>
          <p>• "add rainbow" - Add a rainbow gradient to the component</p>
          <p>• "change theme" - Change the visual theme</p>
          <p className="mt-4">
            <b>
              Keep in mind that this is just a demo – install the package to get
              the full experience!
            </b>
          </p>
        </TerminalOutput>
      )
    } else if (input === 'add rainbow') {
      setIsRainbow(true)
      newLines.push(
        <TerminalOutput key={`rainbow-cmd-${Date.now()}`}>
          {'>'} please make the hello world background rainbow-colored
        </TerminalOutput>,
        <TerminalOutput key={`rainbow-preamble-${Date.now()}`}>
          <b className="text-green-400">Codebuff:</b> Reading additional
          files...
          <p>- web/src/components/app.tsx</p>
          <p>- web/tailwind.config.ts</p>
        </TerminalOutput>,
        <TerminalOutput key={`rainbow-1-${Date.now()}`}>
          🌈 Added a rainbow gradient to the component!
        </TerminalOutput>
      )
    } else if (input === 'change theme') {
      const themes: PreviewTheme[] = ['terminal-y', 'retro', 'light']
      const currentIndex = themes.indexOf(theme)
      const nextTheme = themes[(currentIndex + 1) % themes.length]
      setTheme(nextTheme)

      newLines.push(
        <TerminalOutput key={`theme-cmd-${Date.now()}`}>
          {'>'} change the theme to be more {nextTheme}
        </TerminalOutput>,
        <TerminalOutput key={`rainbow-preamble-${Date.now()}`}>
          <b className="text-green-400">Codebuff:</b> Reading additional
          files...
          <p>- web/src/components/ui/card.tsx</p>
          <p>- common/src/util/file.ts</p>
        </TerminalOutput>,
        <TerminalOutput key={`theme-1-${Date.now()}`}>
          Sure, let's switch to a more {nextTheme} theme... ✨
        </TerminalOutput>,
        <TerminalOutput key={`fix-1-${Date.now()}`}>
          <p>Applying file changes. Please wait...</p>
          <p className="text-green-400">- Updated web/src/components/app.tsx</p>
        </TerminalOutput>
      )
    } else if (input === 'fix the bug') {
      newLines.push(
        <TerminalOutput key={`fix-1-${Date.now()}`}>
          <b className="text-green-400">Codebuff:</b> I found a potential bug -
          the greeting is missing an exclamation mark.
        </TerminalOutput>,
        <TerminalOutput key={`fix-2-${Date.now()}`}>
          I'll add proper punctuation and improve the code style.
        </TerminalOutput>,
        <TerminalOutput key={`fix-3-${Date.now()}`}>
          <p>Applying file changes. Please wait...</p>
          <p className="text-green-400">- Updated web/src/components/app.tsx</p>
          <p className="text-green-400">- Created web/tailwind.config.ts</p>
        </TerminalOutput>
      )
      setPreviewContent('fixed')
    } else if (input === 'clear') {
      setTerminalLines([])
      return
    } else {
      setIsLoading(true)
      const randomFiles = getRandomFiles()
      newLines.push(
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
        <TerminalOutput key={`ask-${Date.now()}`}>Thinking...</TerminalOutput>
      )
      setTerminalLines(newLines)

      try {
        const response = await fetch('/api/demo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: [...messages, input],
          }),
        })

        if (!response.ok) throw new Error('Failed to get response')

        const { html, message } = await response.json()

        setMessages((prev) => [...prev, input, message])
        newLines.push(
          <TerminalOutput key={`resp-1-${Date.now()}`}>
            {message}
          </TerminalOutput>,
          <TerminalOutput key={`resp-2-${Date.now()}`}>
            Applying file changes. Please wait...
          </TerminalOutput>,
          <TerminalOutput key={`resp-3-${Date.now()}`}>
            <p className="text-green-400">- Updated web/src/app/page.tsx</p>
          </TerminalOutput>
        )
        setTerminalLines(newLines)

        await sleep(1000) // Delay so the user has time to read the output
        setPreviewContent(html)
      } catch (error) {
        console.error('Error:', error)
        newLines.push(
          <TerminalOutput key={`error-${Date.now()}`}>
            Sorry, I encountered an error while processing your request.
          </TerminalOutput>
        )
      } finally {
        setIsLoading(false)
      }
    }

    setTerminalLines(newLines)
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 max-w-6xl mx-auto px-4">
      <div className="w-full lg:w-1/2 h-full flex">
        <div className="w-full text-sm">
          <div className="h-[200px] md:h-[400px] lg:h-[800px]">
            <Terminal
              name="Terminal"
              colorMode={ColorMode.Dark}
              onInput={(input) => {
                const cleanInput = input.trim().toLowerCase()
                handleInput(cleanInput)
              }}
              scrollToPosition={true}
              prompt="> "
            >
              <div
                className={cn(
                  'flex flex-col text-sm whitespace-pre-wrap',
                  isLoading && 'opacity-50'
                )}
              >
                {terminalLines}
              </div>
            </Terminal>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 h-[200px] md:h-[400px] lg:h-[800px] flex">
        <BrowserPreview
          content={previewContent}
          isRainbow={isRainbow}
          theme={theme}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}

export default InteractiveTerminalDemo
