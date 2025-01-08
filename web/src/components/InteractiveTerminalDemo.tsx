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

const BrowserPreview: React.FC<BrowserPreviewProps> = ({
  content,
  isRainbow,
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
          <pre
            className={cn(
              'whitespace-pre-wrap relative',
              isRainbow &&
                [
                  'bg-gradient-to-r from-red-500/90 via-purple-500/90 to-blue-500/90',
                  'rounded-lg',
                  'p-2',
                  'text-white',
                  'shadow-inner',
                  'relative',
                ].join(' ')
            )}
          >
            {content}
          </pre>
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
  const [previewContent, setPreviewContent] = useState<string>(`hello world`)
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
      const themes: PreviewTheme[] = ['default', 'terminal-y', 'retro', 'light']
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
      setPreviewContent(`hello world!`)
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
