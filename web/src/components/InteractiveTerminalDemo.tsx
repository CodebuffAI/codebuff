'use client'

import React, { useState } from 'react'
import Terminal, { ColorMode, TerminalOutput } from 'react-terminal-ui'
import { useIsMobile } from '@/hooks/use-mobile'

const InteractiveTerminalDemo = () => {
  const isMobile = useIsMobile()
  const [terminalLines, setTerminalLines] = useState<React.ReactNode[]>([
    <TerminalOutput key="welcome">
      Welcome to Codebuff! Try these commands:
    </TerminalOutput>,
    <TerminalOutput key="help-cmd">
      • help - Show available commands
    </TerminalOutput>,
    <TerminalOutput key="edit-cmd">
      • edit app.js - Edit a JavaScript file
    </TerminalOutput>,
    <TerminalOutput key="fix-cmd">
      • fix bug - Fix a bug in the code
    </TerminalOutput>,
  ])
  const [previewContent, setPreviewContent] = useState<string>(`// app.js
function greet(name) {
  console.log('Hello ' + name)
}

greet('world')`)

  const handleInput = (input: string) => {
    const newLines = [...terminalLines]

    if (input === 'help') {
      newLines.push(
        <TerminalOutput key={`help-${Date.now()}`}>
          Available commands:
        </TerminalOutput>,
        <TerminalOutput key={`help-1-${Date.now()}`}>
          • help - Show this help message
        </TerminalOutput>,
        <TerminalOutput key={`help-2-${Date.now()}`}>
          • edit app.js - Edit a JavaScript file
        </TerminalOutput>,
        <TerminalOutput key={`help-3-${Date.now()}`}>
          • fix bug - Fix a bug in the code
        </TerminalOutput>,
        <TerminalOutput key={`help-4-${Date.now()}`}>
          • clear - Clear the terminal
        </TerminalOutput>
      )
    } else if (input === 'edit app.js') {
      newLines.push(
        <TerminalOutput key={`edit-1-${Date.now()}`}>
          Let me help you improve that code!
        </TerminalOutput>,
        <TerminalOutput key={`edit-2-${Date.now()}`}>
          Adding template literals and proper function formatting...
        </TerminalOutput>
      )
      setPreviewContent(`// app.js
function greet(name) {
  console.log(\`Hello \${name}!\`)
}

greet('world')`)
    } else if (input === 'fix bug') {
      newLines.push(
        <TerminalOutput key={`fix-1-${Date.now()}`}>
          I found a potential bug - the greeting is missing an exclamation mark.
        </TerminalOutput>,
        <TerminalOutput key={`fix-2-${Date.now()}`}>
          I'll add proper punctuation and improve the code style...
        </TerminalOutput>
      )
      setPreviewContent(`// app.js
function greet(name) {
  // Add input validation
  if (!name) {
    throw new Error('Name is required')
  }
  
  console.log(\`Hello \${name}!\`)
}

greet('world')`)
    } else if (input === 'clear') {
      setTerminalLines([])
      return
    } else {
      const errorMessage = `Command not found: ${input}`
      newLines.push(
        <TerminalOutput key={`error-1-${Date.now()}`}>
          {errorMessage}
        </TerminalOutput>,
        <TerminalOutput key={`error-2-${Date.now()}`}>
          Type 'help' to see available commands
        </TerminalOutput>
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
            <div className="flex flex-col text-sm">{terminalLines}</div>
          </Terminal>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex">
        <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 w-full flex flex-col">
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
                app.js
              </div>
            </div>
          </div>
          {/* Content area - adjusted to match terminal's 400px total height */}
          <div className="bg-white dark:bg-gray-900 p-4 font-mono text-sm overflow-auto flex-1">
            <pre className="whitespace-pre-wrap">{previewContent}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}

export default InteractiveTerminalDemo
