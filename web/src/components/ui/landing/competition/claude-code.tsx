import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useRef } from 'react'

interface ClaudeCodeVisualizationProps {
  progress: number
  complexity: 'simple' | 'full'
}

export function ClaudeCodeVisualization({
  progress,
  complexity,
}: ClaudeCodeVisualizationProps) {
  // Calculate time metrics to emphasize slowness
  const elapsedSeconds = Math.floor(progress * 0.95) // 95 seconds total for full progress
  const minutesElapsed = Math.floor(elapsedSeconds / 60)
  const secondsElapsed = elapsedSeconds % 60
  const formattedTime = `${minutesElapsed}:${secondsElapsed.toString().padStart(2, '0')}`

  // Determine visual state based on progress - make loading even longer
  const isLoading = progress < 40 // Extended initial thinking time
  const showFirstResponse = progress >= 40
  const showUserSecondPrompt = progress >= 50
  const showLoadingAgain = progress >= 55
  const showSecondResponse = progress >= 90

  // Loading animation progress (artificially slowed)
  const loadingProgress = isLoading
    ? Math.min(progress * 1.3, 40)
    : showLoadingAgain
      ? 40 + (progress - 45) * 0.4
      : 100

  // Create ref for scrolling
  const messagesRef = useRef<HTMLDivElement>(null)

  // Effect to scroll to bottom when new content appears
  const shouldScrollProgress60 = progress > 60
  const shouldScrollProgress70 = progress > 70

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-medium flex items-center">
            <span className="text-orange-500 mr-2">⌛</span>
            Claude Code
          </h3>
          <p className="text-white/60 mt-1">
            Painfully slow with endless waiting
          </p>
        </div>
      </div>

      {/* Terminal interface with long waiting periods */}
      <div className="flex-1 bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden relative p-4">
        <div
          ref={messagesRef}
          className="text-sm text-white/80 font-mono h-full overflow-y-auto scroll-smooth"
        >
          {/* Initial command and request */}
          <div className="mb-4">
            <div className="text-white/60 text-xs mb-2">
              # Add a dark mode toggle button to a React app
            </div>
            <div className="text-green-400 mb-1">$ claude</div>
            <div className="text-white/90 mb-2">
              Please add a button that toggles the theme between light and dark
              mode to my React app.
            </div>
          </div>

          {/* Long loading period */}
          {!showFirstResponse && (
            <motion.div
              className="flex flex-col items-center justify-center h-32"
              initial={{ opacity: 0.7 }}
              animate={{ opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <div className="text-orange-500 mb-3 text-center">
                Claude is slowtating...
              </div>
              <div className="w-48 h-2 bg-orange-800/20 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-orange-600 to-orange-400"
                  style={{ width: `${loadingProgress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <div className="text-white/40 text-xs mt-3">
                Estimated time remaining: {Math.max(1, 60 - elapsedSeconds)}{' '}
                seconds
              </div>
              <div className="text-white/30 text-[10px] italic mt-1">
                Slowcessing your request...
              </div>
            </motion.div>
          )}

          {/* First Claude response - after a long wait */}
          {showFirstResponse && (
            <motion.div
              className="mb-4 bg-orange-900/10 p-3 rounded-md border-l-2 border-orange-600"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7 }}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="text-orange-500">Claude:</div>
                <div className="text-[10px] text-white/30">
                  Slowponse time: 47s
                </div>
              </div>
              <div className="text-white/80 mb-2">
                I need more information to help you:
              </div>
              <div className="text-white/80 mb-1">
                1. UI library? (Tailwind, MUI, etc.)
              </div>
              <div className="text-white/80 mb-1">
                2. Theme system already set up?
              </div>
              <div className="text-white/80 mb-1">
                3. Where to place the button?
              </div>
            </motion.div>
          )}

          {/* User's second input */}
          {showUserSecondPrompt && (
            <motion.div
              className="mb-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-white/90 mb-2">
                I'm using Tailwind CSS with a Next.js app. No theme context yet.
                Place it in the nav bar.
              </div>
            </motion.div>
          )}

          {/* Second loading period - even longer */}
          {showLoadingAgain && !showSecondResponse && (
            <motion.div
              className="flex flex-col items-center justify-center h-48"
              initial={{ opacity: 0.7 }}
              animate={{ opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <div className="text-orange-500 mb-3 text-center">
                Claude is slowculating...
              </div>
              <div className="w-48 h-2 bg-orange-800/20 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-orange-600 to-orange-400"
                  style={{ width: `${loadingProgress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <div className="text-white/40 text-xs mt-3">
                Slowtimated time remaining: {Math.max(0, 60 - (progress - 45))}{' '}
                seconds
              </div>
              <div className="text-red-400/70 text-[10px] italic mt-3 max-w-xs text-center">
                <span className="font-medium">Still slowiting...</span> Codebuff
                would be done by now
              </div>

              {/* Add frustration messages that appear as time passes */}
              {progress > 60 && (
                <motion.div
                  className="mt-4 bg-black/30 p-2 rounded text-[10px] text-white/50 italic max-w-xs text-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  Maybe I should check Twitter while waiting for this
                  response...
                </motion.div>
              )}

              {progress > 70 && (
                <motion.div
                  className="mt-2 bg-black/30 p-2 rounded text-[10px] text-white/50 italic max-w-xs text-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  <span className="text-orange-500/70">95 seconds</span> of
                  slowmenting? Seriously?
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Finally, after an eternity, the second response */}
          {showSecondResponse && (
            <motion.div
              className="mb-4 bg-orange-900/10 p-3 rounded-md border-l-2 border-orange-600"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7 }}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="text-orange-500">Claude:</div>
                <div className="text-[10px] text-white/30">
                  Slowlapsed time: 58s
                </div>
              </div>
              <div className="text-white/80 mb-2">
                Here's how to add a dark mode toggle:
              </div>

              <div className="text-white/80 text-xs bg-black/20 p-2 rounded font-mono mb-3">
                <div className="text-orange-500/70 mb-1">
                  # Step 1: Set up theme context
                </div>
                <div className="text-white/60">
                  (Create ThemeProvider.tsx first...)
                </div>
              </div>

              <div className="flex justify-between items-center mt-4 mb-2">
                <div className="text-orange-500/70 text-xs">
                  ⚠️ This is just the slowginning
                </div>
                <div className="text-white/40 text-[10px]">1 of 5 steps</div>
              </div>

              <div className="text-white/70 text-xs mt-4 bg-black/30 p-2 rounded">
                <span className="text-orange-500">2x slowwwwer</span> - Codebuff
                finished this already
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Status indicators to emphasize slowness */}
      <div className="mt-3 flex justify-between items-center">
        <div className="text-sm text-white/40">
          {/* Timer to emphasize the wasted time */}
          <div className="bg-black/30 border border-orange-700/30 rounded px-2 py-1 flex items-center">
            <div className="text-orange-500 text-xs font-mono mr-1">⏱️</div>
            <div className="text-white/80 text-xs font-mono">
              {formattedTime}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-white/30">
            {showSecondResponse
              ? 'Finally slowpleting...'
              : showLoadingAgain
                ? 'Still slowthinking...'
                : 'Slow-loading...'}
          </div>
          {/* Visual progress indicator - deliberately slow */}
          <motion.div className="flex items-center bg-black/20 rounded-full h-1.5 w-20 overflow-hidden">
            <motion.div
              className="h-full bg-orange-500"
              style={{
                width: `${Math.min(loadingProgress, 100)}%`,
              }}
            />
          </motion.div>
        </div>
      </div>
    </div>
  )
}
