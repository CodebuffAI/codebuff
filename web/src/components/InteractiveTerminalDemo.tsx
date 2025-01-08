import React, { useState } from 'react'
import Terminal, { ColorMode, TerminalOutput } from 'react-terminal-ui'
import { useIsMobile } from '../hooks/use-mobile'
import { cn } from '../lib/utils'

const WrappedTerminalOutput: React.FC<
  React.PropsWithChildren<{ className?: string }>
> = ({ children, className, ...props }) => {
  return (
    <TerminalOutput {...props}>
      <p className={cn('text-wrap', className)}>{children}</p>
    </TerminalOutput>
  )
}

type PreviewTheme = 'default' | 'terminal-y' | 'retro' | 'light'

interface BrowserPreviewProps {
  content: string
  isRainbow?: boolean
  theme?: PreviewTheme
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
    <h1 class="error">Error: Component failed to render</h1>
    <div class="error-box">
      <p>TypeError: Cannot read properties of undefined (reading 'greeting')</p>
      <p class="dim">at HelloWorld (./components/HelloWorld.tsx:12:23)</p>
      <p class="dim">at renderWithHooks (./node_modules/react-dom/cjs/react-dom.development.js:14985:18)</p>
    </div>
    <p class="dim">This error occurred while attempting to render the greeting component.</p>
  `

  const fixedContent = `
    <h1>Hello World! 👋</h1>
    <p>Welcome to my demo component.</p>
    <p class="success">Everything is working perfectly now!</p>
  `

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
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
            'p-4 font-mono text-sm overflow-auto flex-1 border rounded-b-lg border-gray-200 dark:border-gray-700',

            theme === 'light' &&
              'bg-white text-gray-900 border-2 border-gray-200',
            theme === 'terminal-y' && 'bg-black text-green-500',
            theme === 'retro' &&
              [
                'bg-[#002448] text-[#FFB000] relative font-["Perfect_DOS_VGA_437"]',
                'before:content-[""] before:absolute before:inset-0',
                'before:bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.6)_50%)]',
                'before:bg-[size:100%_4px] before:pointer-events-none',
                'before:animate-scanlines before:opacity-70',
                'after:content-[""] after:absolute after:inset-0',
                'after:bg-[linear-gradient(90deg,rgba(0,0,0,0.7)_0%,transparent_15%,transparent_85%,rgba(0,0,0,0.7)_100%)]',
                'after:bg-[linear-gradient(180deg,rgba(0,0,0,0.7)_0%,transparent_15%,transparent_85%,rgba(0,0,0,0.7)_100%)]',
                'after:rounded-none',
                'after:bg-blend-multiply after:bg-no-repeat',
                '[&_*]:animate-textflicker',
                'border-t-[6px] border-l-[6px] border-[#555] border-r-[6px] border-r-[#111] border-b-[6px] border-b-[#111]',
                'shadow-[0_0_150px_rgba(255,176,0,0.3)]',
                'backdrop-blur-[2px]',
                'after:mix-blend-overlay',
                'after:opacity-80',
                'after:animate-crtflicker',
              ].join(' ')
          )}
        >
          <iframe
            srcDoc={getIframeContent(content, isRainbow, theme)}
            className="w-full h-full border-none"
            sandbox="allow-scripts"
          />
        </div>
      </div>
    </div>
  )
}

const InteractiveTerminalDemo = () => {
  const isMobile = useIsMobile()
  const [terminalLines, setTerminalLines] = useState<React.ReactNode[]>([
    <WrappedTerminalOutput key="welcome">
      Codebuff will read and write files in "/my-demo-project". Type "help" for
      a list of commands.
    </WrappedTerminalOutput>,
  ])
  const [previewContent, setPreviewContent] = useState<string>('error')
  const [isRainbow, setIsRainbow] = useState(false)
  const [theme, setTheme] = useState<PreviewTheme>('default')

  const handleInput = (input: string) => {
    const newLines = [...terminalLines]

    if (input === 'help') {
      newLines.push(
        <WrappedTerminalOutput key={`help-${Date.now()}`}>
          <p>Available commands:</p>
          <p>• fix bug - Fix a bug in the code</p>
          <p>• rainbow - Add a rainbow gradient to the component</p>
          <p>• theme - Change the visual theme</p>
        </WrappedTerminalOutput>
      )
    } else if (input === 'rainbow') {
      setIsRainbow(true)
      newLines.push(
        <WrappedTerminalOutput key={`rainbow-cmd-${Date.now()}`}>
          {'>'} please make the hello world background rainbow-colored
        </WrappedTerminalOutput>,
        <WrappedTerminalOutput key={`rainbow-preamble-${Date.now()}`}>
          <b className="text-green-400">Codebuff:</b> Reading additional
          files...
          <p>- web/src/components/app.tsx</p>
          <p>- web/tailwind.config.ts</p>
        </WrappedTerminalOutput>,
        <WrappedTerminalOutput key={`rainbow-1-${Date.now()}`}>
          🌈 Added a rainbow gradient to the component!
        </WrappedTerminalOutput>
      )
    } else if (input === 'theme') {
      const themes: PreviewTheme[] = ['terminal-y', 'retro', 'light']
      const currentIndex = themes.indexOf(theme)
      const nextTheme = themes[(currentIndex + 1) % themes.length]
      setTheme(nextTheme)

      newLines.push(
        <WrappedTerminalOutput key={`theme-cmd-${Date.now()}`}>
          {'>'} change the theme to be more {nextTheme}
        </WrappedTerminalOutput>,
        <WrappedTerminalOutput key={`rainbow-preamble-${Date.now()}`}>
          <b className="text-green-400">Codebuff:</b> Reading additional
          files...
          <p>- web/src/components/ui/card.tsx</p>
          <p>- common/src/util/file.ts</p>
        </WrappedTerminalOutput>,
        <WrappedTerminalOutput key={`theme-1-${Date.now()}`}>
          Switching to a more {nextTheme} theme... ✨
        </WrappedTerminalOutput>
      )
    } else if (input === 'fix bug') {
      newLines.push(
        <WrappedTerminalOutput key={`fix-1-${Date.now()}`}>
          I found a potential bug - the greeting is missing an exclamation mark.
        </WrappedTerminalOutput>,
        <WrappedTerminalOutput key={`fix-2-${Date.now()}`}>
          I'll add proper punctuation and improve the code style...
        </WrappedTerminalOutput>
      )
      setPreviewContent('fixed')
    } else if (input === 'clear') {
      setTerminalLines([])
      return
    } else {
      const errorMessage = `Command not found: ${input}`
      newLines.push(
        <WrappedTerminalOutput key={`error-1-${Date.now()}`}>
          {errorMessage}
        </WrappedTerminalOutput>,
        <WrappedTerminalOutput key={`error-2-${Date.now()}`}>
          Type 'help' to see available commands
        </WrappedTerminalOutput>
      )
    }

    setTerminalLines(newLines)
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 max-w-6xl mx-auto px-4">
      <div className="w-full lg:w-1/2 h-full flex">
        <div className="w-full text-sm">
          <Terminal
            name="Terminal"
            colorMode={ColorMode.Dark}
            onInput={handleInput}
            height={isMobile ? '200px' : '600px'}
            prompt="> "
          >
            <div className="flex flex-col text-sm whitespace-pre-wrap">
              {terminalLines}
            </div>
          </Terminal>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex">
        <BrowserPreview
          content={previewContent}
          isRainbow={isRainbow}
          theme={theme}
        />
      </div>
    </div>
  )
}

export default InteractiveTerminalDemo
