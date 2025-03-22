'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { useIsMobile } from '@/hooks/use-mobile'

export type CompetitorType = 'cursor' | 'claude-code' | 'cline'

const competitors: CompetitorType[] = ['cursor', 'claude-code', 'cline']

const competitorInfo = {
  cursor: {
    name: 'Cursor',
    color: 'text-red-400',
    description: 'Confusing maze of dead ends',
    emoji: '😫',
  },
  'claude-code': {
    name: 'Claude Code',
    color: 'text-purple-400',
    description: 'Slow, multi-step process',
    emoji: '⌛',
  },
  cline: {
    name: 'Cline',
    color: 'text-yellow-400',
    description: 'Limited to specific environments',
    emoji: '🔒',
  },
}

// Enhanced visualization component
function CompetitorCard({ 
  type, 
  progress, 
  complexity 
}: { 
  type: CompetitorType, 
  progress: number,
  complexity: 'simple' | 'full'
}) {
  // Render different visualizations based on competitor type
  if (type === 'cursor') {
    return <CursorMazeVisualization progress={progress} complexity={complexity} />
  } else if (type === 'claude-code') {
    return <ClaudeCodeVisualization progress={progress} complexity={complexity} />
  } else {
    return <ClineVisualization progress={progress} complexity={complexity} />
  }
}

// Cursor visualization - complex UI with unintuitive commands and shortcuts
function CursorMazeVisualization({ progress, complexity }: { progress: number, complexity: 'simple' | 'full' }) {
  // Control UI elements appearance based on progress
  const showCommandHint1 = progress > 10;
  const showCommandHint2 = progress > 25;
  const showCommandHint3 = progress > 45;
  const showCommandHint4 = progress > 65;
  const showError = progress > 20;
  const showSecondError = progress > 40;
  const showThirdError = progress > 60;
  const showSidebar = progress > 15;
  const showSwitchMode = progress > 30;
  const showAIPanel = progress > 50;
  const showModeSelect = progress > 70;
  
  // Animation for status changes
  const aiStatus = progress < 30 ? "Initializing..." : 
                  progress < 60 ? "Connecting to AI..." : 
                  progress < 80 ? "Ready" : "Generating...";
  
  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-medium flex items-center">
            <span className="text-red-400 mr-2">😫</span>
            Cursor
            <span className="ml-2 text-xs py-0.5 px-1.5 rounded-full bg-black/30 border border-white/10">
              <span className="text-red-400">4x Slower</span>
            </span>
          </h3>
          <p className="text-white/60 mt-1">Confusing interface with unintuitive commands</p>
        </div>
        
        {/* Mock UI controls */}
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
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
              <kbd className="bg-gray-700 px-1.5 rounded text-gray-300">⌘</kbd>+<kbd className="bg-gray-700 px-1.5 rounded text-gray-300">B</kbd> Toggle sidebar
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
                  <kbd className="bg-gray-700 px-1.5 rounded text-gray-300">⌘</kbd>+<kbd className="bg-gray-700 px-1.5 rounded text-gray-300">P</kbd> Switch files
                </motion.div>
              )}
            </div>
            
            {/* Main content - Code with distractions */}
            <div className="relative h-[calc(100%-2rem)] rounded overflow-hidden">
              {/* Base code */}
              <div className="text-white/70 text-sm font-mono">
                <div className="mb-1"><span className="text-white/40 mr-2">1</span>import React from 'react';</div>
                <div className="mb-1"><span className="text-white/40 mr-2">2</span>import {'{'} useState {'}'} from 'react';</div>
                <div className="mb-1"><span className="text-white/40 mr-2">3</span></div>
                <div className="mb-1"><span className="text-white/40 mr-2">4</span>function App() {'{'}</div>
                <div className="mb-1"><span className="text-white/40 mr-2">5</span>  const [count, setCount] = useState(0);</div>
                <div className="mb-1"><span className="text-white/40 mr-2">6</span></div>
                <div className="mb-1 relative"><span className="text-white/40 mr-2">7</span>  return (
                  {/* Command hint at line 7 */}
                  {showCommandHint3 && (
                    <motion.div 
                      className="absolute -right-4 top-0 bg-gray-800/90 px-2 py-1 rounded text-[10px] text-white border border-gray-700 shadow-lg"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <kbd className="bg-gray-700 px-1.5 rounded text-gray-300">⌘</kbd>+<kbd className="bg-gray-700 px-1.5 rounded text-gray-300">L</kbd> Select line
                    </motion.div>
                  )}
                </div>
                <div className="mb-1"><span className="text-white/40 mr-2">8</span>    {'<div>'}</div>
                <div className="mb-1"><span className="text-white/40 mr-2">9</span>      {'<h1>Counter: {count}</h1>'}</div>
                <div className="mb-1"><span className="text-white/40 mr-2">10</span>      {'<button onClick={() => setCount(count + 1)}>Increment</button>'}</div>
                <div className="mb-1"><span className="text-white/40 mr-2">11</span>    {'</div>'}</div>
                <div className="mb-1"><span className="text-white/40 mr-2">12</span>  );</div>
                <div className="mb-1"><span className="text-white/40 mr-2">13</span>{'}'}</div>
                <div className="mb-1"><span className="text-white/40 mr-2">14</span></div>
                <div className="mb-1"><span className="text-white/40 mr-2">15</span>export default App;</div>
              </div>
              
              {/* Small floating AI controls panel */}
              <motion.div 
                className="absolute top-16 right-6 bg-black/50 border border-gray-700 rounded-lg p-2 w-28 shadow-lg"
                initial={{ opacity: 0.8, x: 0 }}
                animate={{ 
                  opacity: 0.8,
                  x: Math.sin(progress / 20) * 10,
                  y: Math.cos(progress / 25) * 5
                }}
                transition={{ duration: 0.5 }}
              >
                <div className="text-white/80 text-xs font-semibold mb-1">AI Commands</div>
                <div className="space-y-1">
                  <div className="bg-gray-800/80 text-white/60 text-[10px] px-1.5 py-0.5 rounded cursor-pointer">/imagine</div>
                  <div className="bg-gray-800/80 text-white/60 text-[10px] px-1.5 py-0.5 rounded cursor-pointer">/edit</div>
                  <div className="bg-gray-800/80 text-white/60 text-[10px] px-1.5 py-0.5 rounded cursor-pointer">/generate</div>
                </div>
              </motion.div>
              
              {/* Random status messages */}
              <div className="fixed left-1/6 bottom-0 right-0 bg-black/30 py-1 px-4 text-[10px] text-white/40 flex justify-between">
                <div>Cursor AI: {aiStatus}</div>
                <div>Ln 7, Col 12</div>
              </div>
              
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
                    <div className="bg-red-800/50 px-1 rounded text-[10px] cursor-pointer">Dismiss</div>
                    <div className="bg-red-800/50 px-1 rounded text-[10px] cursor-pointer">Help</div>
                  </div>
                </motion.div>
              )}
              
              {showSecondError && (
                <motion.div 
                  className="absolute bottom-20 left-10 bg-yellow-950/70 text-yellow-200 border border-yellow-700 p-2 rounded text-xs w-64"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  Warning: Unable to connect to AI service. Check your authentication.
                  <div className="flex mt-1 gap-1">
                    <div className="bg-yellow-800/50 px-1 rounded text-[10px] cursor-pointer">Retry</div>
                    <div className="bg-yellow-800/50 px-1 rounded text-[10px] cursor-pointer">Settings</div>
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
                  <div className="text-white/90 mb-2 font-medium">Command Palette</div>
                  <div className="p-1.5 bg-zinc-800/80 rounded mb-3">
                    <input type="text" className="w-full bg-transparent outline-none" placeholder="Type a command..." />
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
                  <kbd className="bg-gray-700 px-1.5 rounded text-gray-300">Alt</kbd>+<kbd className="bg-gray-700 px-1.5 rounded text-gray-300">Shift</kbd>+<kbd className="bg-gray-700 px-1.5 rounded text-gray-300">C</kbd> Chat with file
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
                width: "33.333333%", 
                opacity: 1,
                transition: { duration: 0.5 }
              }}
            >
              {/* Sidebar header with complex controls */}
              <div className="bg-zinc-900 border-b border-zinc-800 p-2">
                <div className="flex justify-between items-center">
                  <div className="text-white/80 text-xs font-medium">AI Chat</div>
                  <div className="flex gap-1">
                    {showSwitchMode && (
                      <motion.div 
                        className="bg-zinc-800 rounded text-[10px] flex overflow-hidden"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <div className="px-2 py-0.5 bg-zinc-700 text-white/90">Chat</div>
                        <div className="px-2 py-0.5 text-white/60">Agent</div>
                        <div className="px-2 py-0.5 text-white/60">Copilot</div>
                      </motion.div>
                    )}
                    <div className="text-white/60 text-xs cursor-pointer">✕</div>
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
                  {showAIPanel ? "Ask me anything about your code..." : "Loading AI assistant..."}
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
                        <div className="bg-zinc-700 text-[10px] px-1.5 py-0.5 rounded text-white/60 cursor-pointer">↵</div>
                        <div className="bg-zinc-700 text-[10px] px-1.5 py-0.5 rounded text-white/60 cursor-pointer">/</div>
                      </div>
                    </div>
                    <div className="flex justify-between mt-1 text-[9px] text-white/40">
                      <div>Press <kbd className="bg-zinc-800 px-1 rounded">Shift</kbd>+<kbd className="bg-zinc-800 px-1 rounded">Enter</kbd> for newline</div>
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
  );
}

// Claude Code visualization - multiple back-and-forth UI steps
function ClaudeCodeVisualization({ progress, complexity }: { progress: number, complexity: 'simple' | 'full' }) {
  const step = Math.floor(progress / 25); // 0-4 steps based on progress
  
  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-medium flex items-center">
            <span className="text-purple-400 mr-2">⌛</span>
            Claude Code
            <span className="ml-2 text-xs py-0.5 px-1.5 rounded-full bg-black/30 border border-white/10">
              <span className="text-purple-400">2x Slower</span>
            </span>
          </h3>
          <p className="text-white/60 mt-1">Slow, multi-step back-and-forth process</p>
        </div>
      </div>
      
      {/* Terminal interface with multi-step conversation */}
      <div className="flex-1 bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden relative p-4">
        <div className="text-sm text-white/80 font-mono h-full overflow-y-auto">
          {/* Step 1: User query */}
          <div className="mb-4">
            <div className="text-green-400 mb-1">$ claude</div>
            <div className="text-white/90 mb-2">Please add a button that toggles the theme between light and dark mode.</div>
          </div>
          
          {/* Step 2: Claude asks clarification */}
          {step >= 1 && (
            <motion.div 
              className="mb-4 bg-purple-900/10 p-2 rounded-md border-l-2 border-purple-500"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-purple-300 mb-1">Claude:</div>
              <div className="text-white/80">I'd be happy to help you add a theme toggle button. Could you please provide more information about your project?</div>
              <div className="text-white/80 mt-1">1. Which UI framework are you using (React, Vue, etc.)?</div>
              <div className="text-white/80">2. Do you have an existing theme system in place?</div>
              <div className="text-white/80">3. Where would you like the button to be placed?</div>
            </motion.div>
          )}
          
          {/* Step 3: User response */}
          {step >= 2 && (
            <motion.div 
              className="mb-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-white/90 mb-2">I'm using React with Tailwind CSS. I don't have a theme system yet. Please place it in the header.</div>
            </motion.div>
          )}
          
          {/* Step 4: Claude requests additional context */}
          {step >= 3 && (
            <motion.div 
              className="mb-4 bg-purple-900/10 p-2 rounded-md border-l-2 border-purple-500"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-purple-300 mb-1">Claude:</div>
              <div className="text-white/80">Thanks for the information. Before I provide the code, could you show me your Header component code so I can see where to add the button?</div>
            </motion.div>
          )}
          
          {/* Step 5: Final result still waiting */}
          {step >= 4 && (
            <motion.div
              className="mt-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-white/80 italic text-sm bg-black/20 p-2 rounded mb-2">(After several more exchanges...)</div>
              <div className="text-white/70 text-xs mt-4 bg-black/30 p-2 rounded">
                <span className="text-purple-400">2x slower</span> than Codebuff - requires multiple back-and-forth exchanges to complete a simple task
              </div>
            </motion.div>
          )}
        </div>
      </div>
      
      {/* Status indicator */}
      <div className="mt-3 flex justify-between items-center">
        <div className="text-sm text-white/40">
          <span className="text-purple-400">Step {step + 1} of 5</span> - Multi-step process
        </div>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map(idx => (
            <div 
              key={idx}
              className={`w-2 h-2 rounded-full ${idx <= step ? 'bg-purple-500' : 'bg-white/20'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Cline visualization - environmental constraints
function ClineVisualization({ progress, complexity }: { progress: number, complexity: 'simple' | 'full' }) {
  const errorDelay = 50; // Show error after progress reaches this point
  
  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-medium flex items-center">
            <span className="text-yellow-400 mr-2">🔒</span>
            Cline
            <span className="ml-2 text-xs py-0.5 px-1.5 rounded-full bg-black/30 border border-white/10">
              <span className="text-yellow-400">3x Slower</span>
            </span>
          </h3>
          <p className="text-white/60 mt-1">Limited to specific environments</p>
        </div>
      </div>
      
      {/* Terminal interface with environment errors */}
      <div className="flex-1 bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden relative p-4">
        <div className="text-sm text-white/80 font-mono h-full overflow-y-auto">
          {/* Command input */}
          <div className="mb-4">
            <div className="text-green-400 mb-1">$ cline</div>
            <div className="text-white/90 mb-2">Add a new endpoint that returns user profile data</div>
          </div>
          
          {/* Environment error message */}
          {progress > errorDelay && (
            <motion.div 
              className="mb-4 bg-yellow-900/20 p-3 rounded-md border-l-2 border-yellow-500"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7 }}
            >
              <div className="text-yellow-300 font-bold mb-2">⚠️ Environment Error</div>
              <div className="text-white/80 mb-2">Cline requires a compatible Git repository with specific structure.</div>
              <div className="text-white/80 mb-1">Missing requirements:</div>
              <ul className="list-disc list-inside text-white/70 text-xs space-y-1 mb-3">
                <li>Repository structure must follow Cline conventions</li>
                <li>Must be run from the root directory of a compatible project</li>
                <li>Required .cline configuration file not found</li>
                <li>Cannot use with non-standard project layouts</li>
              </ul>
              
              <div className="text-yellow-200/80 text-xs bg-yellow-950/30 p-2 rounded mt-4">
                Cline only works with compatible project structures, limiting its usefulness across different codebases and environments.
              </div>
            </motion.div>
          )}
          
          {/* No result, blocked by environment */}
          {progress > errorDelay + 30 && (
            <motion.div
              className="mt-4 bg-black/30 p-3 rounded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-white/60 text-sm mb-2">Try installing in a compatible project structure:</div>
              <div className="text-green-400 text-xs mb-1">$ cd ~/projects/compatible-project</div>
              <div className="text-green-400 text-xs mb-1">$ cline init</div>
              <div className="text-green-400 text-xs">$ cline configure</div>
              
              <div className="text-white/70 text-xs mt-4 bg-black/30 p-2 rounded">
                <span className="text-yellow-400">3x slower</span> than Codebuff - requires specific environment setup and project structure
              </div>
            </motion.div>
          )}
        </div>
      </div>
      
      {/* Status display */}
      <div className="mt-3 flex justify-between items-center">
        <div className="text-sm text-white/40">
          <span className="text-yellow-400">Environmental restrictions</span> slow down workflow
        </div>
        <div className="text-xs text-white/30 flex items-center">
          <span className="text-yellow-500 mr-1">🔒</span> Limited compatibility
        </div>
      </div>
    </div>
  );
}

export interface CompetitionTabsProps {
  progress?: number;
  animationComplexity?: 'simple' | 'full';
  layout?: 'horizontal' | 'vertical';
  activeTab?: CompetitorType;
  onTabChange?: (tab: CompetitorType) => void;
}

export function CompetitionTabs({ 
  progress = 0, 
  animationComplexity = 'full',
  layout = 'horizontal',
  activeTab: controlledActiveTab,
  onTabChange
}: CompetitionTabsProps) {
  // Use internal state if no controlled state is provided
  const [internalActiveTab, setInternalActiveTab] = useState<CompetitorType>('cursor')
  
  // Determine which state to use (controlled or uncontrolled)
  const activeTab = controlledActiveTab !== undefined ? controlledActiveTab : internalActiveTab
  const isMobile = useIsMobile()
  
  // Force horizontal layout on mobile, otherwise use the specified layout
  const isVertical = layout === 'vertical' && !isMobile
  
  // Handler for tab changes
  const handleTabClick = (tab: CompetitorType) => {
    if (onTabChange) {
      // Controlled mode - notify parent
      onTabChange(tab)
    } else {
      // Uncontrolled mode - update internal state
      setInternalActiveTab(tab)
    }
  }

  // Change tabs automatically based on progress
  useEffect(() => {
    // Skip auto-changing if we're in controlled mode
    if (controlledActiveTab !== undefined) return
    
    const tabThreshold = 100 / competitors.length;
    const tabIndex = Math.min(
      Math.floor(progress / tabThreshold),
      competitors.length - 1
    );
    
    // Only auto-change if progress is incrementing (not user clicking)
    if (progress > 0) {
      setInternalActiveTab(competitors[tabIndex]);
    }
  }, [progress, controlledActiveTab]);
  
  // Handle reduced animations on mobile
  // This is just for guidance - we'll actually rely on the parent to set complexity
  useEffect(() => {
    // Let the parent component control the animation complexity
    // This effect just ensures proper logging or side effects
    console.log("Mobile status:", isMobile ? "mobile" : "desktop", "with complexity:", animationComplexity);
  }, [isMobile, animationComplexity]);

  return (
    <div className={cn(
      "h-full",
      isVertical ? "flex flex-row" : "flex flex-col"
    )}>
      {/* Tabs - horizontal or vertical */}
      <div className={cn(
        isVertical 
          ? "w-1/4 p-2 flex flex-col border-r border-zinc-800/50 bg-black/10" 
          : "p-2 flex border-b border-zinc-800/50 bg-black/10",
        "min-h-[60px]" // Ensure minimum height for horizontal tabs
      )}>
        {competitors.map((competitor) => (
          <motion.button
            key={competitor}
            onClick={() => handleTabClick(competitor)}
            className={cn(
              'text-center py-2 px-4 rounded-lg transition-all duration-300',
              'hover:bg-white/5 relative group',
              isVertical ? "mb-2" : "flex-1", 
              activeTab === competitor
                ? 'bg-white/10 text-white'
                : 'text-white/60'
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="space-y-1">
              <div className={cn(
                "flex items-center justify-center gap-1 md:gap-2",
                isVertical && "justify-start"
              )}>
                <motion.span 
                  className={competitorInfo[competitor].color}
                  animate={activeTab === competitor ? {
                    scale: [1, 1.1, 1],
                    rotate: competitor === 'cursor' ? [0, -5, 0, 5, 0] : undefined
                  } : {}}
                  transition={{ 
                    repeat: Infinity, 
                    duration: competitor === 'cursor' ? 2 : 1.5,
                    repeatDelay: 1
                  }}
                >
                  {competitorInfo[competitor].emoji}
                </motion.span>
                <span className="font-medium">
                  {competitorInfo[competitor].name}
                </span>
                
                {/* Show metrics badge for active tab */}
                {activeTab === competitor && !isMobile && (
                  <motion.span 
                    className="ml-1 text-xs py-0.5 px-1.5 rounded-full bg-black/30 border border-white/10"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                  >
                    {competitor === 'cursor' ? (
                      <span className="text-red-400">4x Slower</span>
                    ) : competitor === 'claude-code' ? (
                      <span className="text-purple-400">2x Slower</span>
                    ) : (
                      <span className="text-yellow-400">3x Slower</span>
                    )}
                  </motion.span>
                )}
              </div>
              <p className={cn(
                "text-xs text-white/40 hidden md:block",
                isVertical && "text-left"
              )}>
                {competitorInfo[competitor].description}
              </p>
            </div>

            {/* Active indicator */}
            <motion.div
              className={cn(
                isVertical 
                  ? 'absolute left-0 top-0 bottom-0 w-0.5 h-full'
                  : 'absolute left-0 right-0 bottom-0 h-0.5 w-full',
                'bg-white/30'
              )}
              initial={false}
              animate={{ 
                scaleY: isVertical && activeTab === competitor ? 1 : isVertical ? 0 : 1,
                scaleX: !isVertical && activeTab === competitor ? 1 : !isVertical ? 0 : 1, 
                opacity: activeTab === competitor ? 1 : 0.3
              }}
              transition={{ duration: 0.3 }}
              style={{ 
                transformOrigin: isVertical ? 'top' : 'center',
                background: activeTab === competitor ? (
                  competitor === 'cursor' ? 'linear-gradient(to right, rgba(248, 113, 113, 0.5), rgba(248, 113, 113, 0.3))' :
                  competitor === 'claude-code' ? 'linear-gradient(to right, rgba(167, 139, 250, 0.5), rgba(167, 139, 250, 0.3))' :
                  'linear-gradient(to right, rgba(251, 191, 36, 0.5), rgba(251, 191, 36, 0.3))'
                ) : 'rgba(255, 255, 255, 0.3)'
              }}
            />
            
            {/* Hover effect */}
            <motion.div 
              className="absolute inset-0 rounded-lg bg-white/0 pointer-events-none"
              initial={false}
              whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.03)' }}
              transition={{ duration: 0.2 }}
            />
          </motion.button>
        ))}
      </div>

      {/* Content Area - shown in both layouts */}
      <div className={cn(
        "relative flex-1 bg-black/20",
        isVertical ? "ml-4" : "mt-1"
      )}>
        <div className="absolute inset-0">
          {competitors.map((competitor) => (
            <motion.div
              key={competitor}
              initial={{ opacity: 0 }}
              animate={{
                opacity: activeTab === competitor ? 1 : 0,
                transition: { duration: 0.3 }
              }}
              className={cn(
                'absolute inset-0',
                activeTab === competitor
                  ? 'pointer-events-auto'
                  : 'pointer-events-none'
              )}
            >
              <CompetitorCard 
                type={competitor} 
                progress={progress}
                complexity={animationComplexity}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}