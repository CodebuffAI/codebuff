'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'

interface CommandLog {
  time: number
  command?: string
  response?: string
  emotion?: string
}

const TOTAL_TIME = 5000 // 5 seconds for the direct path

const commandLogs: CommandLog[] = [
  { time: 0, command: 'cmd + L "change the auth endpoint"', emotion: '👨‍💻' },
  {
    time: 1000,
    command: '',
    response: 'Found auth endpoint in src/auth/controller.ts',
    emotion: '🔍',
  },
  {
    time: 2000,
    command: '@edit src/auth/controller.ts',
    emotion: '✍️',
  },
  {
    time: 3000,
    command: '',
    response: 'Updated endpoint successfully',
    emotion: '✅',
  },
  {
    time: 4000,
    command: '@test auth',
    emotion: '🧪',
  },
  {
    time: 5000,
    command: '',
    response: 'All tests passing',
    emotion: '🎉',
  },
]

interface CodebuffPathProps {
  progress?: number
  complexity?: 'simple' | 'full'
}

export function CodebuffPath({ progress = 100, complexity = 'full' }: CodebuffPathProps) {
  const [visibleLogs, setVisibleLogs] = useState<CommandLog[]>([])
  const [currentEmotion, setCurrentEmotion] = useState('👨‍💻')
  const logContainerRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  
  // Calculate current time based on progress
  const currentTime = Math.min((progress / 100) * TOTAL_TIME, TOTAL_TIME)

  useEffect(() => {
    const newLogs = commandLogs.filter((log) => log.time <= currentTime)
    setVisibleLogs(newLogs)

    // Update emotion based on the most recent log with an emotion
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
  
  // Enhanced visual feedback for progress
  const particleCount = complexity === 'full' && !isMobile ? 15 : 5
  const showParticles = progress > 95
  
  // Calculate average time saved compared to competitors
  const avgTimeSaved = Math.min(75, Math.round((progress / 100) * 75))
  
  // Calculate estimated time to completion (always fast)
  const estimatedTimeMinutes = 5
  const completionPercentage = Math.min(100, progress)
  const estimatedRemainingMinutes = Math.max(0, estimatedTimeMinutes * (1 - completionPercentage / 100)).toFixed(1)
  
  return (
    <div className="bg-black rounded-lg overflow-hidden h-[300px] relative">
      {/* Particles for success celebration */}
      {showParticles && (
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: particleCount }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full bg-green-500"
              initial={{ 
                x: '50%', 
                y: '50%', 
                opacity: 1 
              }}
              animate={{ 
                x: `${Math.random() * 100}%`,
                y: `${Math.random() * 100}%`,
                opacity: 0,
                scale: [1, 0]
              }}
              transition={{ 
                duration: 1.5, 
                delay: i * 0.1,
                repeat: Infinity,
                repeatDelay: 3
              }}
            />
          ))}
        </div>
      )}
    
      {/* Metrics panel */}
      {progress > 30 && complexity === 'full' && !isMobile && (
        <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 rounded-lg text-xs z-20 flex flex-col gap-1 border border-green-500/20">
          {/* Time saved */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-green-400">Time Saved:</span>
            <motion.div 
              className="font-bold flex items-center gap-1 text-green-400"
              animate={{ scale: progress > 80 ? [1, 1.05, 1] : 1 }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              <span>{avgTimeSaved}%</span>
              {progress > 80 && (
                <span className="text-[10px]">⚡</span>
              )}
            </motion.div>
          </div>
          
          {/* CPU usage - low and efficient */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-green-400">CPU Load:</span>
            <span className="font-bold text-green-400">15%</span>
            <div className="w-12 h-1.5 bg-black/50 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-green-500"
                style={{ width: '15%' }}
              />
            </div>
          </div>
          
          {/* Estimated time */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-green-400">Est. Time:</span>
            <motion.div
              className="font-bold flex items-center gap-1 text-green-400"
              animate={progress > 50 ? { scale: [1, 1.05, 1] } : {}}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <span>
                {progress < 100 ? `${estimatedRemainingMinutes}m remaining` : 'Complete!'}
              </span>
            </motion.div>
          </div>
          
          {/* Cost comparison */}
          {progress > 60 && (
            <motion.div 
              className="flex items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <span className="font-mono text-green-400">Cost:</span>
              <span className="font-bold text-green-400">50% Less</span>
            </motion.div>
          )}
          
          {/* Direct path indicator */}
          {progress > 80 && (
            <motion.div 
              className="mt-1 pt-1 border-t border-green-500/20 flex items-center justify-between"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              <span className="text-white/60 text-[10px]">Path:</span>
              <span className="text-green-400 text-[10px] font-bold">Direct ✓</span>
            </motion.div>
          )}
        </div>
      )}
      
      <div className="h-full flex flex-col p-4">
        {/* Mobile view - simplified with status indicators */}
        {isMobile ? (
          <div className="h-full flex flex-col justify-between">
            <div className="space-y-3">
              <motion.div 
                className="bg-green-900/20 px-3 py-2 rounded-lg border border-green-500/20"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-green-400 font-semibold">Codebuff Direct Path</span>
                  <span className="text-xs text-green-400">{Math.round(progress)}% Complete</span>
                </div>
                
                <div className="h-1.5 bg-black/50 rounded-full overflow-hidden w-full">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-green-600 to-green-400"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </motion.div>
              
              {/* Current status */}
              <div className="font-mono text-sm text-green-400 bg-black/40 rounded-lg p-2 border border-green-500/10">
                <AnimatePresence mode="wait">
                  <motion.div 
                    key={visibleLogs.length}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.2 }}
                  >
                    {visibleLogs.length > 0 ? (
                      visibleLogs[visibleLogs.length - 1].command ? 
                        <div className="flex items-center gap-2">
                          <span className="opacity-50">$</span>
                          {visibleLogs[visibleLogs.length - 1].command}
                        </div> : 
                        <div className="text-zinc-400">
                          {visibleLogs[visibleLogs.length - 1].response}
                        </div>
                    ) : (
                      <div>Initializing...</div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
              
              {/* Time and efficiency metrics */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-black/40 rounded-lg p-2 border border-green-500/10">
                  <div className="text-white/60 text-xs mb-1">Time to Complete:</div>
                  <div className="text-green-400 font-mono font-bold">
                    {progress < 100 ? `${estimatedRemainingMinutes}m remaining` : 'Complete!'}
                  </div>
                </div>
                <div className="bg-black/40 rounded-lg p-2 border border-green-500/10">
                  <div className="text-white/60 text-xs mb-1">CPU Usage:</div>
                  <div className="text-green-400 font-mono font-bold">15% (Low)</div>
                </div>
              </div>
            </div>
            
            <motion.div
              className={cn(
                "text-3xl mt-4 text-center flex-shrink-0 pb-2",
                showParticles && "text-4xl"
              )}
              animate={showParticles ? {
                scale: [1, 1.2, 1],
                rotate: [0, 5, 0, -5, 0]
              } : {
                scale: [1, 1.1, 1]
              }}
              transition={{
                repeat: Infinity,
                duration: showParticles ? 0.8 : 1.5,
              }}
            >
              {currentEmotion}
            </motion.div>
          </div>
        ) : (
          <>
            {/* Desktop view - full command logs */}
            <div
              ref={logContainerRef}
              className="flex-1 overflow-y-auto space-y-2 font-mono text-sm min-h-0"
            >
              {visibleLogs.map((log, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="font-mono"
                >
                  {log.command ? (
                    <div className="text-green-400 flex items-center gap-2">
                      <span className="opacity-50">$</span>
                      {log.command}
                    </div>
                  ) : log.response ? (
                    <div className="text-zinc-400 pl-4 border-l border-zinc-800 flex items-center gap-2">
                      {log.response}
                    </div>
                  ) : null}
                </motion.div>
              ))}
            </div>

            <motion.div
              className={cn(
                "text-3xl mt-4 text-center flex-shrink-0",
                showParticles && "text-4xl"
              )}
              animate={showParticles ? {
                scale: [1, 1.2, 1],
                rotate: [0, 5, 0, -5, 0]
              } : {
                scale: [1, 1.1, 1]
              }}
              transition={{
                repeat: Infinity,
                duration: showParticles ? 0.8 : 1.5,
              }}
            >
              {currentEmotion}
            </motion.div>
          </>
        )}
        
        {/* Success highlight glow */}
        {showParticles && (
          <motion.div
            className="absolute inset-x-0 bottom-0 h-20 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ 
              repeat: Infinity,
              duration: 2
            }}
            style={{
              background: 'radial-gradient(ellipse at bottom, rgba(50, 255, 150, 0.3) 0%, transparent 70%)'
            }}
          />
        )}
      </div>
    </div>
  )
}