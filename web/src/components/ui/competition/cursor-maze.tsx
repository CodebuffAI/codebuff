'use client'

import { motion } from 'framer-motion'
import { useEffect, useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'

interface CommandLog {
  time: number
  command?: string
  response?: string
  emotion?: string
  showPath?: boolean // Indicates if this log should show a path branching
  isDeadEnd?: boolean // Indicates if this is a dead end
}

const TOTAL_TIME = 20000 // 20 seconds for the maze path
const BASE_Y = 150 // Base vertical position for animations

const commandLogs: CommandLog[] = [
  { time: 1000, command: 'cmd + L "change the auth endpoint"', emotion: '👨‍💻' },
  {
    time: 2000,
    command: '',
    response: 'I see several endpoints. Which specific one?',
    emotion: '🤔',
  },
  { time: 3000, command: '@codebase show me auth endpoints', emotion: '👨‍💻', showPath: true },
  {
    time: 4000,
    command: '',
    response: 'Here are the auth endpoints I found...',
    emotion: '🧐',
  },
  { time: 5000, command: 'cmd + L "the one in AuthController"', emotion: '😕' },
  {
    time: 6000,
    command: '',
    response: "I don't see AuthController. Did you mean UserController?",
    emotion: '😣',
    showPath: true,
    isDeadEnd: true,
  },
  { time: 7000, command: '@search AuthController', emotion: '😤' },
  {
    time: 8000,
    command: '',
    response: 'No results found for "AuthController"',
    emotion: '😫',
    isDeadEnd: true,
  },
  { time: 9000, command: 'cmd + L "show all controllers"', emotion: '😭', showPath: true },
  {
    time: 10000,
    command: '',
    response: 'Here are all controllers in the project...',
    emotion: '🤦‍♂️',
  },
  { time: 11000, command: '@file src/controllers/auth.ts', emotion: '😤' },
  {
    time: 12000,
    command: '',
    response: 'File not found. Similar files: src/auth/controller.ts',
    emotion: '😡',
    showPath: true,
    isDeadEnd: true,
  },
  { time: 13000, command: '@open src/auth/controller.ts', emotion: '😠' },
  { time: 14000, command: 'cmd + L "now change the endpoint"', emotion: '🤬' },
  {
    time: 15000,
    command: '',
    response: "Here's a suggestion to modify the endpoint...",
    emotion: '😫',
    showPath: true,
  },
  { time: 16000, command: '/revert', emotion: '😖', isDeadEnd: true },
  {
    time: 17000,
    command: 'cmd + L "let\'s try a different approach"',
    emotion: '😩',
  },
  {
    time: 18000,
    command: '',
    response: 'Would you like me to suggest alternative approaches?',
    emotion: '😤',
    showPath: true,
    isDeadEnd: true,
  },
  { time: 19000, command: '@quit', emotion: '😑' },
]

interface Path {
  x: number;
  y: number;
  showError?: boolean;
  isDeadEnd?: boolean;
  fromX: number;
  fromY: number;
}

interface CursorMazeProps {
  progress?: number;
  complexity?: 'simple' | 'full';
}

export function CursorMaze({ progress = 100, complexity = 'full' }: CursorMazeProps) {
  const [visibleLogs, setVisibleLogs] = useState<CommandLog[]>([])
  const [currentEmotion, setCurrentEmotion] = useState('👨‍💻')
  const [paths, setPaths] = useState<Path[]>([])
  const [deadEnds, setDeadEnds] = useState<number[]>([])
  const [timeWasted, setTimeWasted] = useState(0) // Track wasted time
  const logContainerRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  
  // Calculate current time based on progress
  const currentTime = Math.min((progress / 100) * TOTAL_TIME, TOTAL_TIME)
  
  // Calculate CPU usage based on progress (simulated)
  const cpuUsage = Math.min(30 + (progress / 100) * 60, 90)
  
  // Generate maze paths based on command logs
  useEffect(() => {
    const newPaths: Path[] = []
    const newDeadEnds: number[] = []
    const branchPoints = commandLogs.filter(log => log.showPath)
    
    // The main path
    const mainPathPoints = [
      { x: 0, y: 6 },
      { x: 100, y: 6 }
    ]
    
    branchPoints.forEach((point, i) => {
      if (point.time <= currentTime) {
        // For each branch point that should be visible, add a path
        const xPos = (point.time / TOTAL_TIME) * 100
        
        // Create a branching path
        const branchLength = complexity === 'simple' ? 2 : 2 + i % 3
        
        const deadEndIndex = commandLogs.findIndex(log => 
          log.isDeadEnd && log.time > point.time && (!log.showPath || log.time < (branchPoints[i+1]?.time || TOTAL_TIME))
        )
        
        if (deadEndIndex !== -1 && deadEndIndex < commandLogs.length && commandLogs[deadEndIndex].time <= currentTime) {
          newDeadEnds.push(deadEndIndex)
        }
        
        // Add a path going up or down randomly from the main path
        const direction = i % 2 === 0 ? 1 : -1
        
        // Create path segments that look like a maze
        for (let j = 1; j <= branchLength; j++) {
          const fromX = j === 1 ? xPos : xPos + ((j-1) * 5)
          const fromY = j === 1 ? 6 : (6 + (direction * (j-1) * 10))
          
          const toX = xPos + (j * 5)
          const toY = 6 + (direction * j * 10)
          
          const isLastSegment = j === branchLength
          const isDeadEnd = point.isDeadEnd && isLastSegment
          
          newPaths.push({ 
            x: toX, 
            y: toY,
            fromX,
            fromY,
            showError: isDeadEnd,
            isDeadEnd
          })
        }
      }
    })
    
    setPaths(newPaths)
    setDeadEnds(newDeadEnds)
  }, [currentTime, complexity])

  useEffect(() => {
    const newLogs = commandLogs.filter((log) => log.time <= currentTime)
    setVisibleLogs(newLogs)

    const latestEmotion = newLogs.findLast((log) => log.emotion)?.emotion
    if (latestEmotion) {
      setCurrentEmotion(latestEmotion)
    }
  }, [currentTime])

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [visibleLogs])
  
  // Show error indicator on frustration
  const showError = currentTime > 12000
  
  // Simplify for mobile
  const displayMode = isMobile || complexity === 'simple' ? 'simple' : 'full'
  
  // Calculate wasted time and dead ends metrics
  const deadEndCount = deadEnds.length
  
  // Calculate wasted time percentage based on dead ends and current time
  useEffect(() => {
    // Each dead end wastes approximately 20% of total time
    // Also factor in progress to make the wasted time increase as progress increases
    const baseWastedPercent = Math.min(deadEndCount * 20, 60)
    const progressFactor = (currentTime / TOTAL_TIME) * 15 // Additional 0-15% based on progress
    const wastedTimePercent = Math.min(baseWastedPercent + progressFactor, 75)
    
    setTimeWasted(Math.round(wastedTimePercent))
  }, [deadEndCount, currentTime])
  
  const deadEndPercentage = Math.min(deadEndCount * 20, 100)
  const timeWastedDisplay = `${timeWasted}%`
  
  // Calculate comparison metrics for Codebuff vs Cursor
  const timeCompletionRatio = Math.min(Math.round((currentTime / TOTAL_TIME) * 100), 100)
  const codebuffProgress = Math.min(timeCompletionRatio * 4, 100) // Codebuff moves 4x faster

  return (
    <div className="relative w-full h-full">
      {/* Dead end counter */}
      {displayMode === 'full' && deadEndCount > 0 && (
        <div className="absolute top-0 right-0 px-2 py-1 bg-black/80 rounded-lg flex items-center gap-2 text-xs text-red-400 z-20">
          <span className="font-mono">Dead Ends:</span>
          <motion.span 
            initial={{ scale: 1 }}
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.5 }}
            className="font-bold"
          >
            {deadEndCount}
          </motion.span>
        </div>
      )}
      
      {/* Metrics panel with enhanced visualization */}
      {displayMode === 'full' && currentTime > TOTAL_TIME / 5 && (
        <div className="absolute top-0 left-0 px-2 py-1 bg-black/80 rounded-lg flex flex-col gap-1 text-xs z-20 border border-red-500/20">
          <div className="flex items-center gap-2">
            <span className="font-mono text-amber-400">Wasted Time:</span>
            <motion.span 
              initial={{ opacity: 0 }}
              animate={{ 
                opacity: 1,
                scale: timeWasted > 50 ? [1, 1.1, 1] : 1
              }}
              transition={{ 
                repeat: timeWasted > 50 ? Infinity : 0,
                duration: 1
              }}
              className={cn(
                "font-bold",
                timeWasted < 30 ? "text-amber-400" : 
                timeWasted < 60 ? "text-orange-400" : 
                "text-red-400"
              )}
            >
              {timeWastedDisplay}
            </motion.span>
          </div>
          
          {/* CPU usage indicator */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-amber-400">CPU Load:</span>
            <span className="font-bold text-red-400">{Math.round(cpuUsage)}%</span>
            <div className="w-12 h-1.5 bg-black/50 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-red-500"
                initial={{ width: '0%' }}
                animate={{ width: `${cpuUsage}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
          
          {/* Task completion comparison */}
          {timeCompletionRatio > 20 && (
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-white/60">Progress:</span>
              <span className="font-bold text-white/80">{timeCompletionRatio}%</span>
            </div>
          )}
          
          {/* Codebuff comparison */}
          {timeWasted > 20 && (
            <motion.div 
              className="mt-2 pt-2 border-t border-white/10 space-y-1.5"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <div className="text-green-400 text-xs font-semibold flex items-center gap-1">
                <span className="text-[10px]">⚡</span>
                <span>Codebuff Comparison</span>
              </div>
              
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-green-400">0% wasted time</span>
                <span className="text-green-400">Progress: {codebuffProgress}%</span>
              </div>
              
              <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-gradient-to-r from-green-600 to-green-400"
                  initial={{ width: '0%' }}
                  animate={{ width: `${codebuffProgress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              
              {timeCompletionRatio > 30 && (
                <motion.div 
                  className="text-xs bg-green-950/50 px-1.5 py-0.5 rounded-sm flex items-center justify-between"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                >
                  <span className="text-green-400">CPU: 15%</span>
                  <span className="text-green-400">4x Faster</span>
                </motion.div>
              )}
            </motion.div>
          )}
        </div>
      )}
    
      {/* Maze visualization - only shown in full complexity mode */}
      {displayMode === 'full' && (
        <div className="absolute top-8 left-0 w-full h-32 z-10">
          {/* Main path line */}
          <div className="absolute top-6 left-0 h-0.5 bg-red-400/30 w-full" />
          
          {/* Path segments */}
          {paths.map((path, index) => {
            // Calculate path segment coordinates
            const dx = path.x - path.fromX
            const dy = path.y - path.fromY
            const angle = Math.atan2(dy, dx) * (180 / Math.PI)
            const length = Math.sqrt(dx * dx + dy * dy)
            
            return (
              <motion.div
                key={index}
                className={cn(
                  "absolute h-0.5",
                  path.isDeadEnd 
                    ? "bg-gradient-to-r from-red-500 to-red-800" 
                    : path.showError 
                      ? "bg-red-500" 
                      : "bg-amber-500/60"
                )}
                style={{ 
                  left: `${path.fromX}%`,
                  top: path.fromY,
                  width: `${length}%`,
                  transformOrigin: 'left',
                  rotate: `${angle}deg`,
                }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.3 }}
              />
            )
          })}
          
          {/* Dead end markers */}
          {paths.filter(p => p.isDeadEnd).map((deadEnd, index) => (
            <motion.div
              key={`deadend-${index}`}
              className="absolute flex items-center justify-center"
              style={{ 
                left: `${deadEnd.x}%`,
                top: deadEnd.y - 6,
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <motion.div 
                className="text-white bg-red-600 text-xs px-1 rounded-full flex items-center justify-center w-5 h-5"
                animate={{ 
                  boxShadow: ['0 0 0px rgba(220, 38, 38, 0)', '0 0 8px rgba(220, 38, 38, 0.7)', '0 0 0px rgba(220, 38, 38, 0)'] 
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                ✖
              </motion.div>
              <div className="absolute top-5 text-xs text-red-500 whitespace-nowrap bg-black/80 px-1 rounded font-mono">
                DEAD END
              </div>
            </motion.div>
          ))}
          
          {/* Current position indicator */}
          <motion.div
            className="absolute w-3 h-3 rounded-full bg-red-400 shadow-md z-20"
            style={{ 
              left: `${(currentTime / TOTAL_TIME) * 100}%`,
              top: '6px',
              transform: 'translate(-50%, -50%)'
            }}
            animate={{ 
              boxShadow: showError 
                ? '0 0 8px 2px rgba(239, 68, 68, 0.7)' 
                : '0 0 0px 0px rgba(239, 68, 68, 0)' 
            }}
            transition={{ duration: 1, repeat: showError ? Infinity : 0, repeatType: 'reverse' }}
          />
        </div>
      )}
      
      {/* Terminal output */}
      <div className="bg-black rounded-lg overflow-hidden h-[300px] relative mt-40">
        {/* Error popovers - simulating errors and confusion */}
        {showError && displayMode === 'full' && (
          <>
            <motion.div
              className="absolute top-5 right-5 px-3 py-2 bg-red-950/80 border border-red-500/50 rounded-lg text-xs text-red-400 max-w-[180px] z-10"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.5 }}
            >
              Error: Cannot find module 'AuthController'
            </motion.div>
            
            <motion.div
              className="absolute bottom-20 left-5 px-3 py-2 bg-yellow-950/80 border border-yellow-500/50 rounded-lg text-xs text-yellow-400 max-w-[180px] z-10"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.8 }}
            >
              Warning: Multiple context switches detected
            </motion.div>
          </>
        )}
        
        {/* "Feature needed" popup - when user gets frustrated */}
        {currentTime > 10000 && displayMode === 'full' && (
          <motion.div
            className="absolute top-1/4 left-1/2 -translate-x-1/2 px-3 py-2 bg-zinc-900/95 border border-zinc-700 rounded-lg text-sm text-white z-20 max-w-[250px]"
            initial={{ opacity: 0, scale: 0.8, y: -20 }}
            animate={{ 
              opacity: [0, 1, 1, 1, 0],
              scale: [0.8, 1, 1, 1, 0.8],
              y: [-20, 0, 0, 0, -20]
            }}
            transition={{ 
              duration: 8,
              times: [0, 0.1, 0.7, 0.9, 1],
              repeat: Infinity,
              repeatDelay: 12
            }}
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-yellow-400 text-lg">⚠️</span>
                <span className="font-medium">Feature Update Required</span>
              </div>
              <p className="text-xs text-gray-400">Install the latest plugin to access this feature. Requires administrator privileges.</p>
            </div>
          </motion.div>
        )}
        
        <div className="h-full flex flex-col p-4">
          <div
            ref={logContainerRef}
            className="flex-1 overflow-y-auto space-y-2 font-mono text-sm min-h-0"
          >
            {visibleLogs.map((log, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  "font-mono",
                  log.isDeadEnd && "border-l-2 border-red-500 pl-2"
                )}
              >
                {log.command ? (
                  <div className="text-amber-400 flex items-center gap-2">
                    <span className="opacity-50">$</span>
                    {log.command}
                    {log.isDeadEnd && (
                      <span className="ml-2 text-xs bg-red-900/50 text-red-400 px-1 rounded">DEAD END</span>
                    )}
                  </div>
                ) : log.response ? (
                  <div className={cn(
                    "text-zinc-400 pl-4 border-l border-zinc-800 flex items-center gap-2",
                    log.isDeadEnd && "border-l border-red-800"
                  )}>
                    {log.response}
                  </div>
                ) : null}
              </motion.div>
            ))}
          </div>

          <motion.div
            className="text-3xl mt-4 text-center flex-shrink-0"
            animate={showError ? {
              rotate: [0, -3, 3, -3, 0],
              scale: [1, 1.1, 1]
            } : {
              scale: [1, 1.1, 1]
            }}
            transition={{
              repeat: Infinity,
              duration: showError ? 0.5 : 1.5,
            }}
          >
            {currentEmotion}
          </motion.div>
          
          {/* Error indicator */}
          {showError && (
            <motion.div
              className="absolute inset-x-0 bottom-0 h-20 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.1, 0.3, 0.1] }}
              transition={{ 
                repeat: Infinity,
                duration: 2
              }}
              style={{
                background: 'radial-gradient(ellipse at bottom, rgba(255, 50, 50, 0.2) 0%, transparent 70%)'
              }}
            />
          )}
        </div>
      </div>
      
      {/* Confusion meter */}
      {displayMode === 'full' && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1 text-xs font-mono text-red-400 z-20">
          <span>Confusion:</span>
          <div className="h-2 w-28 bg-black/70 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-gradient-to-r from-amber-500 to-red-500"
              initial={{ width: '0%' }}
              animate={{ width: `${Math.min(currentTime / TOTAL_TIME * 150, 100)}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      )}
    </div>
  )
}