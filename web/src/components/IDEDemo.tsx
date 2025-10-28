'use client'

import {
  ChevronRight,
  ChevronDown,
  GitBranch,
  Search,
  Settings,
  Bug,
  Split,
  X,
  Plus,
  Trash,
  Files,
  Package,
} from 'lucide-react'
import React, { useState, useEffect, useRef } from 'react'

import Terminal, { ColorMode } from './ui/terminal'
import TerminalOutput from './ui/terminal/terminal-output'

import { cn } from '@/lib/utils'

interface FileItem {
  name: string
  type: 'file' | 'folder'
  children?: FileItem[]
  extension?: string
  active?: boolean
}

const fileStructure: FileItem[] = [
  {
    name: 'src',
    type: 'folder',
    children: [
      { name: 'index.ts', type: 'file', extension: 'ts', active: true },
      {
        name: 'api',
        type: 'folder',
        children: [
          { name: 'auth.ts', type: 'file', extension: 'ts' },
          { name: 'users.ts', type: 'file', extension: 'ts' },
          { name: 'projects.ts', type: 'file', extension: 'ts' },
        ],
      },
      {
        name: 'utils',
        type: 'folder',
        children: [
          { name: 'helpers.ts', type: 'file', extension: 'ts' },
          { name: 'types.ts', type: 'file', extension: 'ts' },
          { name: 'constants.ts', type: 'file', extension: 'ts' },
          { name: 'validation.ts', type: 'file', extension: 'ts' },
        ],
      },
      {
        name: 'components',
        type: 'folder',
        children: [
          { name: 'App.tsx', type: 'file', extension: 'tsx' },
          { name: 'Button.tsx', type: 'file', extension: 'tsx' },
          { name: 'Card.tsx', type: 'file', extension: 'tsx' },
          { name: 'Input.tsx', type: 'file', extension: 'tsx' },
          {
            name: 'forms',
            type: 'folder',
            children: [
              { name: 'LoginForm.tsx', type: 'file', extension: 'tsx' },
              { name: 'SignupForm.tsx', type: 'file', extension: 'tsx' },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'tests',
    type: 'folder',
    children: [
      { name: 'index.test.ts', type: 'file', extension: 'ts' },
      { name: 'auth.test.ts', type: 'file', extension: 'ts' },
      { name: 'utils.test.ts', type: 'file', extension: 'ts' },
    ],
  },
  {
    name: 'config',
    type: 'folder',
    children: [
      { name: 'tsconfig.json', type: 'file', extension: 'json' },
      { name: 'jest.config.js', type: 'file', extension: 'js' },
      { name: '.env.example', type: 'file', extension: 'env' },
    ],
  },
]

const FileIcon = ({ extension }: { extension?: string }) => {
  const iconColor =
    {
      ts: 'text-blue-400',
      tsx: 'text-blue-500',
      js: 'text-yellow-400',
      jsx: 'text-yellow-500',
      json: 'text-yellow-300',
      md: 'text-white',
    }[extension || ''] || 'text-zinc-400'

  return (
    <div className={cn('w-4 h-4 mr-2', iconColor)}>
      {extension ? '📄' : '📁'}
    </div>
  )
}

const FileTreeItem = ({
  item,
  depth = 0,
}: {
  item: FileItem
  depth?: number
}) => {
  const [isOpen, setIsOpen] = useState(item.type === 'folder')

  return (
    <div>
      <div
        className={cn(
          'flex items-center text-sm text-zinc-300 hover:bg-zinc-800/50 rounded px-2 py-1 cursor-pointer group transition-colors duration-150',
          item.active && 'bg-zinc-800',
        )}
        style={{ paddingLeft: `${depth * 1.2 + 0.5}rem` }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {item.type === 'folder' && (
          <div
            className="w-4 h-4 mr-1 transition-transform duration-200"
            style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}
          >
            <ChevronRight size={16} />
          </div>
        )}
        <FileIcon extension={item.extension} />
        <span>{item.name}</span>
      </div>
      {isOpen && item.children && (
        <div className="animate-slideDown">
          {item.children.map((child, index) => (
            <FileTreeItem
              key={child.name + index}
              item={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface IDEDemoProps {
  className?: string
}

const PHRASES_TO_TYPE = [
  'refactor the onboarding module',
  'fix auth token expiration bug',
  'add dark mode to dashboard',
  'optimize my database calls across my API endpoints',
  'update user profile schema',
]

// Define timeouts in milliseconds
const SHOW_IDE_DELAY = 1500
const HIDE_TERMINAL_DELAY = 1000
const EXPAND_TERMINAL_DELAY = 500

export function IDEDemo({ className }: IDEDemoProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showIDE, setShowIDE] = useState(false)
  const [showOriginalTerminal, setShowOriginalTerminal] = useState(true)
  const [expandTerminal, setExpandTerminal] = useState(false)

  const [terminalLines, setTerminalLines] = useState<string[]>([])
  const [typingText, setTypingText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()

    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    const timeoutIds: NodeJS.Timeout[] = []

    // Step 1: Show the IDE
    const timer1 = setTimeout(() => {
      setShowIDE(true)
    }, SHOW_IDE_DELAY)
    timeoutIds.push(timer1)

    // Step 2: Hide the original terminal
    const timer2 = setTimeout(() => {
      setShowOriginalTerminal(false)
    }, SHOW_IDE_DELAY + HIDE_TERMINAL_DELAY)
    timeoutIds.push(timer2)

    // Step 3: Expand the terminal
    const timer3 = setTimeout(
      () => {
        setExpandTerminal(true)
      },
      SHOW_IDE_DELAY + HIDE_TERMINAL_DELAY + EXPAND_TERMINAL_DELAY,
    )
    timeoutIds.push(timer3)

    // Cleanup all timeouts on component unmount
    return () => {
      timeoutIds.forEach((id) => clearTimeout(id))
    }
  }, [])

  useEffect(() => {
    if (!showIDE) return

    const messages = [
      'Codebuff will read and write files in "/Users/me/projects/your-next-app". Type "help" for commands.',
      'Welcome back! What would you like to do?',
      '',
    ]

    let currentMessageIndex = 0

    const streamWords = (message: string, onComplete: () => void) => {
      const words = message.split(/\s+/)
      let currentWordIndex = 0
      let currentText = ''

      const addNextWords = () => {
        if (currentWordIndex >= words.length) {
          onComplete()
          return
        }

        const wordsToAdd = Math.min(
          Math.floor(Math.random() * 4) + 1,
          words.length - currentWordIndex,
        )

        const nextSegment = words
          .slice(currentWordIndex, currentWordIndex + wordsToAdd)
          .join(' ')
        currentText += (currentText ? ' ' : '') + nextSegment
        currentWordIndex += wordsToAdd

        setTerminalLines((prev) => {
          const newLines = [...prev]
          if (newLines.length === currentMessageIndex) {
            newLines.push(currentText)
          } else {
            newLines[currentMessageIndex] = currentText
          }
          return newLines
        })

        if (currentWordIndex < words.length) {
          setTimeout(addNextWords, Math.random() * 100 + 50)
        } else {
          setTimeout(onComplete, 100)
        }
      }

      addNextWords()
    }

    const processNextMessage = () => {
      if (currentMessageIndex >= messages.length) {
        // Start typing animation after all messages are shown
        startTypingAnimation()
        return
      }

      const message = messages[currentMessageIndex]

      if (message.startsWith('your-next-app >')) {
        setTerminalLines((prev) => [...prev, message])
        currentMessageIndex++
        setTimeout(processNextMessage, 1500)
      } else {
        streamWords(message, () => {
          currentMessageIndex++
          const delay =
            currentMessageIndex === 1
              ? 2000
              : currentMessageIndex === messages.length
                ? 0
                : 700
          setTimeout(processNextMessage, delay)
        })
      }
    }

    const startTypingAnimation = () => {
      let currentPhraseIndex = 0
      setIsTyping(true)

      const typePhrase = (phrase: string, callback: () => void) => {
        let index = 0

        const typeNextChar = () => {
          if (index < phrase.length) {
            setTypingText(phrase.substring(0, index + 1))
            index++

            // Random typing speed between 50ms and 150ms for realistic effect
            const typingSpeed = Math.floor(Math.random() * 100) + 50
            setTimeout(typeNextChar, typingSpeed)
          } else {
            // Phrase is fully typed, wait before moving to next phrase
            setTimeout(callback, 1500)
          }
        }

        typeNextChar()
      }

      const startNextPhrase = () => {
        const phrase = PHRASES_TO_TYPE[currentPhraseIndex]

        // Reset text before starting new phrase
        setTypingText('')

        // Small delay before starting to type the next phrase
        setTimeout(() => {
          typePhrase(phrase, () => {
            // Move to next phrase (cycle back to beginning if needed)
            currentPhraseIndex =
              (currentPhraseIndex + 1) % PHRASES_TO_TYPE.length
            startNextPhrase()
          })
        }, 300)
      }

      startNextPhrase()
    }

    setTimeout(processNextMessage, 500)
  }, [showIDE])

  return (
    <div className="mb-16 md:mb-0">
      <div className="border border-zinc-800 rounded-lg overflow-hidden shadow-lg">
        <div
          className={cn(
            'relative w-full transition-all duration-1000 ease-in-out overflow-visible',
            showIDE
              ? isMobile
                ? 'h-[450px]'
                : 'h-[650px]'
              : isMobile
                ? 'h-[300px]'
                : 'h-[400px]',
            className,
          )}
        >
          {isMobile && (
            <div
              className={cn(
                'absolute inset-0 bg-black transition-all duration-1000 z-20',
                showIDE ? 'opacity-100 scale-100' : 'opacity-0 scale-95',
              )}
            >
              <div className="flex flex-col h-full">
                <div className="bg-zinc-900 p-2 flex items-center justify-between border-b border-zinc-800">
                  <div className="flex items-center">
                    <Files size={16} className="text-green-500 mr-2" />{' '}
                    <span className="text-xs text-zinc-500">
                      YOUR FAVORITE IDE
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <GitBranch size={14} className="text-zinc-400" />
                    <Search size={14} className="text-zinc-400" />
                    <Settings size={14} className="text-zinc-400" />
                  </div>
                </div>

                <div className="border-b border-zinc-800 overflow-x-auto whitespace-nowrap py-1 px-2 bg-black/40">
                  <div className="inline-flex gap-1">
                    <div className="flex items-center bg-zinc-800 rounded px-2 py-1 text-xs text-zinc-300">
                      <FileIcon extension="ts" />
                      <span>index.ts</span>
                    </div>
                    <div className="flex items-center bg-black/30 rounded px-2 py-1 text-xs text-zinc-400">
                      <FileIcon extension="ts" />
                      <span>auth.ts</span>
                    </div>
                  </div>
                </div>

                <div
                  className={cn(
                    'flex-1 p-3 text-xs font-dm-mono relative bg-black/60 transition-all duration-500',
                    expandTerminal && 'h-[30%]',
                  )}
                >
                  <div className="flex relative z-0">
                    <div className="text-zinc-600 mr-2 select-none w-4 text-right">
                      1
                    </div>
                    <div className="text-zinc-300">
                      <span>console.log(</span>
                      <span className="text-green-400">"Hello, Codebuff!"</span>
                      <span>);</span>
                    </div>
                  </div>
                  <div className="flex relative z-0 mt-1">
                    <div className="text-zinc-600 mr-2 select-none w-4 text-right">
                      2
                    </div>
                    <div className="text-zinc-300">
                      <span>{`// Mobile-friendly IDE demo`}</span>
                    </div>
                  </div>
                </div>

                <div
                  className={cn(
                    'border-t border-zinc-800 bg-black/80 transition-all duration-1000',
                    expandTerminal ? 'h-[70%]' : 'h-[50%]',
                  )}
                >
                  <div className="flex items-center border-b border-zinc-800 px-3 py-1 bg-black/40">
                    <span className="text-xs text-zinc-400">TERMINAL</span>
                    <button
                      className="ml-auto p-1 hover:bg-zinc-800 rounded"
                      onClick={() => setExpandTerminal(!expandTerminal)}
                    >
                      {expandTerminal ? (
                        <ChevronDown size={14} className="text-zinc-400" />
                      ) : (
                        <ChevronRight size={14} className="text-zinc-400" />
                      )}
                    </button>
                  </div>{' '}
                  <div className="p-3 text-xs font-dm-mono">
                    {terminalLines.length > 0 ? (
                      <>
                        {terminalLines.map((line, index) => (
                          <div key={index} className="text-zinc-300 my-1">
                            {line.startsWith('your-next-app >') ? (
                              <span>
                                <span className="text-green-400">
                                  your-next-app {'>'}
                                </span>
                                {line.substring(12)}
                              </span>
                            ) : (
                              line
                            )}
                          </div>
                        ))}
                        {isTyping && (
                          <div className="text-zinc-300 my-1">
                            <span className="text-green-400">
                              your-next-app {'>'}
                            </span>{' '}
                            {typingText}
                            <span className="inline-block w-2 h-6 ml-1 bg-green-400 animate-pulse align-middle relative -top-[1px]"></span>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="text-zinc-300 mt-1">
                          Type 'help' for commands
                        </div>
                        <div className="text-green-400 mt-2">
                          {'>'} <span className="animate-pulse">|</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isMobile && (
            <div
              className={cn(
                'absolute inset-0 bg-black transition-all duration-1000',
                showIDE ? 'opacity-100 scale-100' : 'opacity-0 scale-95',
              )}
            >
              <div className="flex h-full">
                <div className="w-12 border-r border-zinc-800 flex flex-col items-center py-2 bg-black/20 relative">
                  <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-black/50 pointer-events-none z-10" />
                  <div className="relative z-0 flex flex-col items-center space-y-4">
                    <button className="p-2 text-zinc-400 hover:text-zinc-300">
                      <Files size={20} />
                    </button>
                    <button className="p-2 text-zinc-400 hover:text-zinc-300">
                      <Search size={20} />
                    </button>
                    <button className="p-2 text-zinc-400 hover:text-zinc-300">
                      <GitBranch size={20} />
                    </button>
                    <button className="p-2 text-zinc-400 hover:text-zinc-300">
                      <Bug size={20} />
                    </button>
                    <button className="p-2 text-zinc-400 hover:text-zinc-300">
                      <Package size={20} />
                    </button>
                  </div>
                </div>

                <div
                  className={cn(
                    'border-r border-zinc-800 transition-all duration-1000 bg-black/20 relative',
                    showIDE ? 'w-64' : 'w-0',
                  )}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-black/50 pointer-events-none z-10" />
                  <div className="p-2">
                    <div className="text-sm text-zinc-400 mb-2 flex items-center">
                      <span className="flex-1">EXPLORER</span>
                      <button className="p-1 hover:bg-zinc-800 rounded">
                        <ChevronDown size={16} />
                      </button>
                    </div>
                    <div className="space-y-1">
                      {fileStructure.map((item, index) => (
                        <FileTreeItem key={item.name + index} item={item} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex-1 flex flex-col bg-black/30">
                  <div className="border-b border-zinc-800 h-9 flex items-center px-2 relative">
                    <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-black/50 pointer-events-none z-10" />
                    <div className="flex items-center space-x-1 relative z-0">
                      <div className="flex items-center bg-zinc-800 rounded-t px-3 py-1 text-sm text-zinc-300 group cursor-pointer">
                        <FileIcon extension="ts" />
                        <span>index.ts</span>
                        <button className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="flex items-center hover:bg-zinc-800/50 rounded-t px-3 py-1 text-sm text-zinc-400 group cursor-pointer">
                        <FileIcon extension="ts" />
                        <span>auth.ts</span>
                        <button className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="flex items-center hover:bg-zinc-800/50 rounded-t px-3 py-1 text-sm text-zinc-400 group cursor-pointer">
                        <FileIcon extension="tsx" />
                        <span>App.tsx</span>
                        <button className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    className={cn(
                      'flex-1 p-4 font-mono text-sm relative transition-all duration-1000',
                      expandTerminal && 'h-[20%]',
                    )}
                    ref={editorRef}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/70 to-black/70 pointer-events-none z-10" />
                    <div className="flex relative z-0">
                      <div className="text-zinc-600 mr-4 select-none w-6 text-right">
                        1
                      </div>
                      <div className="text-zinc-300">
                        <span className="text-blue-400">import</span>
                        <span> {'{'} </span>
                        <span className="text-amber-300">useEffect</span>
                        <span>, </span>
                        <span className="text-amber-300">useState</span>
                        <span> {'}'} </span>
                        <span className="text-blue-400">from</span>
                        <span className="text-green-400"> 'react'</span>
                      </div>
                    </div>
                    <div className="flex relative z-0">
                      <div className="text-zinc-600 mr-4 select-none w-6 text-right">
                        2
                      </div>
                      <div className="text-zinc-300">
                        <span className="text-blue-400">import</span>
                        <span> {'{'} </span>
                        <span className="text-amber-300">axios</span>
                        <span> {'}'} </span>
                        <span className="text-blue-400">from</span>
                        <span className="text-green-400"> 'axios'</span>
                      </div>
                    </div>
                    <div className="flex relative z-0">
                      <div className="text-zinc-600 mr-4 select-none w-6 text-right">
                        3
                      </div>
                      <div className="text-zinc-300"></div>
                    </div>
                    <div className="flex relative z-0">
                      <div className="text-zinc-600 mr-4 select-none w-6 text-right">
                        4
                      </div>
                      <div className="text-zinc-300">
                        <span className="text-blue-400">interface</span>
                        <span className="text-amber-300"> User</span>
                        <span> {`{`}</span>
                      </div>
                    </div>
                    <div className="flex relative z-0">
                      <div className="text-zinc-600 mr-4 select-none w-6 text-right">
                        5
                      </div>
                      <div className="text-zinc-300 pl-8">
                        <span>id: </span>
                        <span className="text-amber-300">string</span>
                      </div>
                    </div>
                    <div className="flex relative z-0">
                      <div className="text-zinc-600 mr-4 select-none w-6 text-right">
                        6
                      </div>
                      <div className="text-zinc-300 pl-8">
                        <span>email: </span>
                        <span className="text-amber-300">string</span>
                      </div>
                    </div>
                    <div className="flex relative z-0">
                      <div className="text-zinc-600 mr-4 select-none w-6 text-right">
                        7
                      </div>
                      <div className="text-zinc-300">
                        <span>{`}`}</span>
                      </div>
                    </div>
                    <div className="flex relative z-0">
                      <div className="text-zinc-600 mr-4 select-none w-6 text-right">
                        8
                      </div>
                      <div className="text-zinc-300"></div>
                    </div>
                    <div className="flex relative z-0">
                      <div className="text-zinc-600 mr-4 select-none w-6 text-right">
                        9
                      </div>
                      <div className="text-zinc-300">
                        <span className="text-purple-400">export</span>
                        <span className="text-blue-400"> function</span>
                        <span className="text-amber-300"> UserProfile</span>
                        <span>() {`{`}</span>
                      </div>
                    </div>
                    <div className="flex relative z-0">
                      <div className="text-zinc-600 mr-4 select-none w-6 text-right">
                        10
                      </div>
                      <div className="text-zinc-300 pl-4">
                        <span className="text-blue-400">const</span>
                        <span> [user, setUser] = </span>
                        <span className="text-amber-300">useState</span>
                        <span>{`<`}</span>
                        <span className="text-amber-300">User</span>
                        <span>{`>`}</span>
                        <span>();</span>
                      </div>
                    </div>
                  </div>

                  <div
                    className={cn(
                      'border-t border-zinc-800 transition-all duration-1000 bg-black z-10',
                      showIDE
                        ? expandTerminal
                          ? 'h-[70%]'
                          : 'h-[300px]'
                        : 'h-full',
                    )}
                  >
                    <div className="flex items-center border-b border-zinc-800 px-4 py-1">
                      <span className="text-xs text-zinc-400">TERMINAL</span>
                      <div className="ml-auto flex items-center space-x-2">
                        <button className="p-1 hover:bg-zinc-800 rounded">
                          <Split size={14} className="text-zinc-400" />
                        </button>
                        <button className="p-1 hover:bg-zinc-800 rounded">
                          <Plus size={14} className="text-zinc-400" />
                        </button>
                        <button className="p-1 hover:bg-zinc-800 rounded">
                          <Trash size={14} className="text-zinc-400" />
                        </button>
                      </div>
                    </div>
                    <Terminal
                      colorMode={ColorMode.Dark}
                      prompt="> "
                      showWindowButtons={false}
                    >
                      {terminalLines.map((line, index) => (
                        <TerminalOutput key={index}>{line}</TerminalOutput>
                      ))}
                      {isTyping && (
                        <TerminalOutput>
                          <span className="text-green-400">
                            your-next-app {'>'}
                          </span>{' '}
                          {typingText}
                          <span className="inline-block w-2 h-6 ml-1 bg-green-400 animate-pulse align-middle relative -top-[1px]"></span>
                        </TerminalOutput>
                      )}
                    </Terminal>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showOriginalTerminal && (
            <div
              className={cn(
                'absolute inset-0 transition-all duration-1000',
                showIDE ? 'opacity-0' : 'opacity-100',
              )}
            >
              <Terminal
                name="Terminal"
                colorMode={ColorMode.Dark}
                prompt="> "
                showWindowButtons={true}
              >
                <TerminalOutput>
                  <span className="text-green-400 underline">Codebuff:</span>{' '}
                  <span className="text-white">Code from your terminal!</span>
                </TerminalOutput>
              </Terminal>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default IDEDemo
