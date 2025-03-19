'use client'

import React, { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import Terminal from './ui/terminal'
import TerminalOutput from './ui/terminal/terminal-output'
import { ColorMode } from './ui/terminal'
import {
  ChevronRight,
  ChevronDown,
  GitBranch,
  Search,
  Settings,
  Bug,
  Play,
  Split,
  X,
  Plus,
  Trash,
} from 'lucide-react'

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
        name: 'utils',
        type: 'folder',
        children: [
          { name: 'helpers.ts', type: 'file', extension: 'ts' },
          { name: 'types.ts', type: 'file', extension: 'ts' },
        ],
      },
      {
        name: 'components',
        type: 'folder',
        children: [
          { name: 'App.tsx', type: 'file', extension: 'tsx' },
          { name: 'Button.tsx', type: 'file', extension: 'tsx' },
        ],
      },
    ],
  },
  {
    name: 'tests',
    type: 'folder',
    children: [{ name: 'index.test.ts', type: 'file', extension: 'ts' }],
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
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div>
      <div
        className={cn(
          'flex items-center text-sm text-zinc-300 hover:bg-zinc-800/50 rounded px-2 py-1 cursor-pointer group transition-colors duration-150',
          item.active && 'bg-zinc-800'
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

export function IDEDemo({ className }: IDEDemoProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showIDE, setShowIDE] = useState(false)
  const [showOriginalTerminal, setShowOriginalTerminal] = useState(true)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [currentLine, setCurrentLine] = useState(1)
  const [currentCol, setCurrentCol] = useState(1)
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Start transition after 3 seconds
    const timer = setTimeout(() => {
      setShowIDE(true)
      // Remove original terminal after transition completes
      setTimeout(() => {
        setShowOriginalTerminal(false)
      }, 1000)
    }, 3000)

    return () => clearTimeout(timer)
  }, [])

  // Simulate typing effect
  useEffect(() => {
    if (showIDE) {
      const code = 'console.log("Hello, Codebuff!");'
      let position = 0

      const interval = setInterval(() => {
        if (position <= code.length) {
          setCursorPosition(position)
          setCurrentCol(position + 1)
          position++
        } else {
          clearInterval(interval)
        }
      }, 100)

      return () => clearInterval(interval)
    }
  }, [showIDE])

  return (
    <div
      className={cn(
        'relative w-full transition-all duration-1000 ease-in-out',
        showIDE ? 'h-[600px]' : 'h-[400px]',
        className
      )}
    >
      <div
        className={cn(
          'absolute inset-0 bg-black/80 rounded-lg border border-zinc-800 backdrop-blur transition-all duration-1000',
          showIDE ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        )}
      >
        {/* IDE Layout */}
        <div className="flex h-full">
          {/* Activity Bar */}
          <div className="w-12 border-r border-zinc-800 flex flex-col items-center py-4 space-y-4">
            <button className="p-2 text-zinc-400 hover:text-white transition-colors">
              <Search size={20} />
            </button>
            <button className="p-2 text-zinc-400 hover:text-white transition-colors">
              <GitBranch size={20} />
            </button>
            <button className="p-2 text-zinc-400 hover:text-white transition-colors">
              <Bug size={20} />
            </button>
            <button className="p-2 text-zinc-400 hover:text-white transition-colors">
              <Settings size={20} />
            </button>
          </div>

          {/* Sidebar */}
          <div
            className={cn(
              'border-r border-zinc-800 transition-all duration-1000 bg-black/20',
              showIDE ? 'w-64' : 'w-0'
            )}
          >
            {/* File Explorer */}
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

          {/* Main Editor Area */}
          <div className="flex-1 flex flex-col bg-black/30">
            {/* Tabs */}
            <div className="border-b border-zinc-800 h-9 flex items-center px-2">
              <div className="flex items-center bg-zinc-800 rounded-t px-3 py-1 text-sm text-zinc-300 group">
                <FileIcon extension="ts" />
                <span>index.ts</span>
                <button className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Editor Content */}
            <div
              className="flex-1 p-4 font-mono text-sm relative"
              ref={editorRef}
            >
              <div className="flex">
                <div className="text-zinc-600 mr-4 select-none w-6 text-right">
                  1
                </div>
                <div className="text-zinc-300 relative">
                  {showIDE && (
                    <>
                      <span>console.log(</span>
                      <span className="text-green-400">"Hello, Codebuff!"</span>
                      <span>);</span>
                      <div
                        className="absolute top-0 w-[2px] h-[1.2em] bg-white/70 transition-all duration-75"
                        style={{ left: `${cursorPosition * 8}px` }}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Status Bar */}
            <div className="h-6 border-t border-zinc-800 bg-zinc-900/50 flex items-center px-4 text-xs text-zinc-400 justify-between">
              <div className="flex items-center space-x-4">
                <span className="flex items-center">
                  <GitBranch size={12} className="mr-1" /> main
                </span>
                <span>TypeScript</span>
                <span>UTF-8</span>
              </div>
              <div className="flex items-center space-x-4">
                <span>
                  Ln {currentLine}, Col {currentCol}
                </span>
                <span>Spaces: 2</span>
              </div>
            </div>

            {/* Terminal Panel */}
            <div
              className={cn(
                'border-t border-zinc-800 transition-all duration-1000 bg-black/40',
                showIDE ? 'h-[300px]' : 'h-full'
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
                <TerminalOutput>
                  Welcome to Codebuff! Type 'help' for a list of commands.
                </TerminalOutput>
              </Terminal>
            </div>
          </div>
        </div>
      </div>

      {/* Original Terminal (fades out) */}
      {showOriginalTerminal && (
        <div 
          className={cn(
            'absolute inset-0 transition-all duration-1000',
            showIDE ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
          )}
        >
          <Terminal
            name="Terminal"
            colorMode={ColorMode.Dark}
            prompt="> "
            showWindowButtons={true}
          >
            <TerminalOutput>
              Welcome to Codebuff! Type 'help' for a list of commands.
            </TerminalOutput>
          </Terminal>
        </div>
      )}
    </div>
  )
}

export default IDEDemo
