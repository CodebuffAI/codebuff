import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface CursorMazeVisualizationProps {
  progress: number
  complexity: 'simple' | 'full'
}

export function CursorMazeVisualization({
  progress,
  complexity,
}: CursorMazeVisualizationProps) {
  // Control UI elements appearance based on progress
  const showCommandHint1 = progress > 10
  const showCommandHint2 = progress > 25
  const showCommandHint3 = progress > 45
  const showCommandHint4 = progress > 65
  const showError = progress > 20
  const showSecondError = progress > 40
  const showThirdError = progress > 60
  const showSidebar = progress > 15
  const showSwitchMode = progress > 30
  const showAIPanel = progress > 50
  const showModeSelect = progress > 70

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-medium flex items-center">
            <span className="text-red-400 mr-2">😫</span>
            Cursor
          </h3>
          <p className="text-white/60 mt-1">
            Confusing interface with unintuitive commands
          </p>
        </div>
      </div>

      {/* Simulated IDE with complex UI */}
      <div className="flex-1 bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden relative">
        {/* File explorer sidebar */}
        <div className="absolute left-0 top-0 bottom-0 w-1/6 border-r border-zinc-800 bg-black/20 p-2">
          <div className="text-xs text-white/40 mb-2">PROJECT</div>
          <div className="text-white/70 text-sm mb-1">▶ src</div>
          <div className="text-white/70 text-sm mb-1 ml-3">▶ components</div>
          <div className="text-white/70 text-sm mb-1 ml-3">▶ utils</div>
          <div className="text-white/70 text-sm mb-1">▶ public</div>
          <div className="text-white/70 text-sm mb-1">▶ node_modules</div>

          {/* Command hint for sidebar */}
          {showCommandHint1 && (
            <motion.div
              className="absolute left-2 top-16 bg-gray-800/90 px-2 py-1 rounded text-[10px] text-white border border-gray-700 shadow-lg"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <kbd className="bg-gray-700 px-1.5 rounded text-gray-300">⌘</kbd>+
              <kbd className="bg-gray-700 px-1.5 rounded text-gray-300">B</kbd>{' '}
              Toggle sidebar
            </motion.div>
          )}
        </div>

        {/* Code editor area */}
        <div className="absolute left-1/6 right-0 top-0 bottom-0 p-4 flex">
          <div className="flex-grow relative">
            {/* Code editor toolbar */}
            <div className="flex items-center mb-3 border-b border-zinc-800 pb-2 relative">
              <div className="text-white/60 text-xs mr-4">main.tsx</div>
              <div className="text-white/40 text-xs mr-4">utils.ts</div>
              <div className="text-white/40 text-xs">components.tsx</div>

              {/* Command hint for tabs */}
              {showCommandHint2 && (
                <motion.div
                  className="absolute right-4 top-0 bg-gray-800/90 px-2 py-1 rounded text-[10px] text-white border border-gray-700 shadow-lg"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <kbd className="bg-gray-700 px-1.5 rounded text-gray-300">
                    ⌘
                  </kbd>
                  +
                  <kbd className="bg-gray-700 px-1.5 rounded text-gray-300">
                    P
                  </kbd>{' '}
                  Switch files
                </motion.div>
              )}
            </div>

            {/* Main content - Code with distractions */}
            <div className="relative h-[calc(100%-2rem)] rounded overflow-hidden">
              {/* Base code */}
              <div className="text-white/70 text-sm font-mono">
                <div className="mb-1">
                  <span className="text-white/40 mr-2">1</span>import React from
                  'react';
                </div>
                <div className="mb-1">
                  <span className="text-white/40 mr-2">2</span>import {'{'}{' '}
                  useState {'}'} from 'react';
                </div>
                <div className="mb-1">
                  <span className="text-white/40 mr-2">3</span>
                </div>
                <div className="mb-1">
                  <span className="text-white/40 mr-2">4</span>function App(){' '}
                  {'{'}
                </div>
                <div className="mb-1">
                  <span className="text-white/40 mr-2">5</span> const [count,
                  setCount] = useState(0);
                </div>
                <div className="mb-1">
                  <span className="text-white/40 mr-2">6</span>
                </div>
                <div className="mb-1 relative">
                  <span className="text-white/40 mr-2">7</span> return (
                  {/* Command hint at line 7 */}
                  {showCommandHint3 && (
                    <motion.div
                      className="absolute -right-4 top-0 bg-gray-800/90 px-2 py-1 rounded text-[10px] text-white border border-gray-700 shadow-lg"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <kbd className="bg-gray-700 px-1.5 rounded text-gray-300">
                        ⌘
                      </kbd>
                      +
                      <kbd className="bg-gray-700 px-1.5 rounded text-gray-300">
                        L
                      </kbd>{' '}
                      Select line
                    </motion.div>
                  )}
                </div>
                <div className="mb-1">
                  <span className="text-white/40 mr-2">8</span> {'<div>'}
                </div>
                <div className="mb-1">
                  <span className="text-white/40 mr-2">9</span>{' '}
                  {'<h1>Counter: {count}</h1>'}
                </div>
                <div className="mb-1">
                  <span className="text-white/40 mr-2">10</span>{' '}
                  {
                    '<button onClick={() => setCount(count + 1)}>Increment</button>'
                  }
                </div>
                <div className="mb-1">
                  <span className="text-white/40 mr-2">11</span> {'</div>'}
                </div>
                <div className="mb-1">
                  <span className="text-white/40 mr-2">12</span> );
                </div>
                <div className="mb-1">
                  <span className="text-white/40 mr-2">13</span>
                  {'}'}
                </div>
                <div className="mb-1">
                  <span className="text-white/40 mr-2">14</span>
                </div>
                <div className="mb-1">
                  <span className="text-white/40 mr-2">15</span>export default
                  App;
                </div>
              </div>

              {/* Small floating AI controls panel */}
              <motion.div
                className="absolute top-16 right-6 bg-black/50 border border-gray-700 rounded-lg p-2 w-28 shadow-lg"
                initial={{ opacity: 0.8, x: 0 }}
                animate={{
                  opacity: 0.8,
                  x: Math.sin(progress / 20) * 10,
                  y: Math.cos(progress / 25) * 5,
                }}
                transition={{ duration: 0.5 }}
              >
                <div className="text-white/80 text-xs font-semibold mb-1">
                  AI Commands
                </div>
                <div className="space-y-1">
                  <div className="bg-gray-800/80 text-white/60 text-[10px] px-1.5 py-0.5 rounded cursor-pointer">
                    /imagine
                  </div>
                  <div className="bg-gray-800/80 text-white/60 text-[10px] px-1.5 py-0.5 rounded cursor-pointer">
                    /edit
                  </div>
                  <div className="bg-gray-800/80 text-white/60 text-[10px] px-1.5 py-0.5 rounded cursor-pointer">
                    /generate
                  </div>
                </div>
              </motion.div>

              {/* Fixed blinking cursor */}
              <motion.div
                className="absolute left-[120px] top-[127px] w-[2px] h-[14px] bg-red-400"
                animate={{ opacity: [1, 0, 1] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
              />

              {/* Error popups that appear */}
              {showError && (
                <motion.div
                  className="absolute top-20 right-4 bg-red-950/70 text-red-200 border border-red-700 p-2 rounded text-xs w-60"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  Error: Cannot use AI commands here. Try using /help first.
                  <div className="flex mt-1 gap-1">
                    <div className="bg-red-800/50 px-1 rounded text-[10px] cursor-pointer">
                      Dismiss
                    </div>
                    <div className="bg-red-800/50 px-1 rounded text-[10px] cursor-pointer">
                      Help
                    </div>
                  </div>
                </motion.div>
              )}

              {showSecondError && (
                <motion.div
                  className="absolute bottom-20 left-10 bg-yellow-950/70 text-yellow-200 border border-yellow-700 p-2 rounded text-xs w-64"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  Warning: Unable to connect to AI service. Check your
                  authentication.
                  <div className="flex mt-1 gap-1">
                    <div className="bg-yellow-800/50 px-1 rounded text-[10px] cursor-pointer">
                      Retry
                    </div>
                    <div className="bg-yellow-800/50 px-1 rounded text-[10px] cursor-pointer">
                      Settings
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Command palette popup */}
              {showThirdError && (
                <motion.div
                  className="absolute top-1/3 left-1/4 right-[40%] bg-zinc-900/95 text-white/80 border border-zinc-700 p-3 rounded-lg text-xs shadow-xl z-10"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="text-white/90 mb-2 font-medium">
                    Command Palette
                  </div>
                  <div className="p-1.5 bg-zinc-800/80 rounded mb-3">
                    <input
                      type="text"
                      className="w-full bg-transparent outline-none"
                      placeholder="Type a command..."
                    />
                  </div>

                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    <div className="flex justify-between p-1 hover:bg-zinc-800/50 rounded cursor-pointer">
                      <div>Generate Component</div>
                      <div className="text-white/40">⌘+G</div>
                    </div>
                    <div className="flex justify-between p-1 hover:bg-zinc-800/50 rounded cursor-pointer">
                      <div>Fix Code</div>
                      <div className="text-white/40">⌘+F</div>
                    </div>
                    <div className="flex justify-between p-1 hover:bg-zinc-800/50 rounded cursor-pointer">
                      <div>Explain Code</div>
                      <div className="text-white/40">⌘+E</div>
                    </div>
                    <div className="flex justify-between p-1 bg-zinc-800/60 rounded cursor-pointer">
                      <div>Restart AI Service</div>
                      <div className="text-white/40">⌘+R</div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Command hint for new keyboard shortcut */}
              {showCommandHint4 && (
                <motion.div
                  className="absolute left-1/4 bottom-16 bg-gray-800/90 px-2 py-1 rounded text-[10px] text-white border border-gray-700 shadow-lg"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <kbd className="bg-gray-700 px-1.5 rounded text-gray-300">
                    Alt
                  </kbd>
                  +
                  <kbd className="bg-gray-700 px-1.5 rounded text-gray-300">
                    Shift
                  </kbd>
                  +
                  <kbd className="bg-gray-700 px-1.5 rounded text-gray-300">
                    C
                  </kbd>{' '}
                  Chat with file
                </motion.div>
              )}
            </div>
          </div>

          {/* Complex AI Chat/Agent sidebar on the right */}
          {showSidebar && (
            <motion.div
              className="w-1/3 border-l border-zinc-800 bg-black/20 overflow-hidden"
              initial={{ width: 0, opacity: 0 }}
              animate={{
                width: '33.333333%',
                opacity: 1,
                transition: { duration: 0.5 },
              }}
            >
              {/* Sidebar header with complex controls */}
              <div className="bg-zinc-900 border-b border-zinc-800 p-2">
                <div className="flex justify-between items-center">
                  <div className="text-white/80 text-xs font-medium">
                    AI Chat
                  </div>
                  <div className="flex gap-1">
                    {showSwitchMode && (
                      <motion.div
                        className="bg-zinc-800 rounded text-[10px] flex overflow-hidden"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <div className="px-2 py-0.5 bg-zinc-700 text-white/90">
                          Chat
                        </div>
                        <div className="px-2 py-0.5 text-white/60">Agent</div>
                        <div className="px-2 py-0.5 text-white/60">Copilot</div>
                      </motion.div>
                    )}
                    <div className="text-white/60 text-xs cursor-pointer">
                      ✕
                    </div>
                  </div>
                </div>

                {/* Model selector */}
                {showModeSelect && (
                  <motion.div
                    className="mt-2 flex justify-between items-center text-[10px] bg-zinc-800/60 rounded p-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className="text-white/70">Model:</div>
                    <div className="flex items-center gap-1">
                      <div className="text-white/90">GPT-4 Turbo</div>
                      <div className="text-white/60">▼</div>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* AI conversation area */}
              <div className="p-2 overflow-y-auto h-[calc(100%-5rem)]">
                {/* Empty state or initial prompt */}
                <div className="text-white/40 text-xs text-center my-4">
                  {showAIPanel
                    ? 'Ask me anything about your code...'
                    : 'Loading AI assistant...'}
                </div>

                {/* AI composer section */}
                {showAIPanel && (
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 p-2 border-t border-zinc-800 bg-zinc-900"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className="relative">
                      <textarea
                        className="w-full bg-zinc-800/60 border border-zinc-700 rounded p-2 text-white/80 text-xs min-h-[60px] resize-none"
                        placeholder="Ask a question or type / to use commands..."
                      ></textarea>
                      <div className="absolute right-2 bottom-2 flex gap-1">
                        <div className="bg-zinc-700 text-[10px] px-1.5 py-0.5 rounded text-white/60 cursor-pointer">
                          ↵
                        </div>
                        <div className="bg-zinc-700 text-[10px] px-1.5 py-0.5 rounded text-white/60 cursor-pointer">
                          /
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between mt-1 text-[9px] text-white/40">
                      <div>
                        Press{' '}
                        <kbd className="bg-zinc-800 px-1 rounded">Shift</kbd>+
                        <kbd className="bg-zinc-800 px-1 rounded">Enter</kbd>{' '}
                        for newline
                      </div>
                      <div>Tokens: 0/16k</div>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Status line at bottom */}
      <div className="mt-3 flex justify-between items-center">
        <div className="text-sm text-white/40">
          <span className="text-red-400">4x slower</span> than Codebuff
        </div>
        <div className="flex items-center gap-1 text-xs text-white/30">
          <span className="text-red-400/80">⌘+?</span>
          <span>6 errors, 3 warnings</span>
        </div>
      </div>
    </div>
  )
}
