import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useRef, useEffect, useState, useMemo } from 'react'

interface GithubCopilotVisualizationProps {
  progress: number
  complexity: 'simple' | 'full'
  isActive?: boolean
}

const codeHallucinations = [
  "import React from 'react';",
  "import { useState } from 'react';",
  "import { ThemeToggle } from 'react-themed';",
  "import { configureTheme } from 'theme-context';",
  'import pandas as pd;',
  'from sklearn.model_selection import train_test_split',
  'const syncThemeWithServer = async (theme) => {',
  "  await fetch('https://api.auth.io/v2/preferences');",
  '};',
  '@Component({ themeable: true })',
  'class ThemeManager extends React.PureComponent {',
  '  static getDerivedContextFromProps(props, state) {',
  '    return { ...state, themeContext: props.context };',
  '  }',
  '  render() {',
  '    return <ThemeContext.Provider value={this.state.theme}>',
  '      {this.props.children}',
  '    </ThemeContext.Provider>;',
  '  }',
  '}',
]

const originalCode = [
  'function ThemeToggle() {',
  "  const [theme, setTheme] = useState('light');",
  '  const toggleTheme = () => {',
  "    setTheme(theme === 'light' ? 'dark' : 'light');",
  '  };',
  '  return (',
  '    <button onClick={toggleTheme}>',
  '      Toggle Theme: {theme}',
  '    </button>',
  '  );',
  '}',
]

const matrixWords = [
  'useState',
  'useEffect',
  'useContext',
  'useMemo',
  'useCallback',
  'createTheme',
  'ThemeProvider',
  'configureStore',
  'dispatch',
  'middleware',
  'reducer',
  'action',
  'state',
  'props',
  'context',
  'component',
  'render',
  'React',
  'Fragment',
  'memo',
  'forwardRef',
  'createPortal',
  'Suspense',
  'lazy',
  'ErrorBoundary',
  'StrictMode',
  'Provider',
  'Consumer',
  'selector',
  'combineReducers',
  'applyMiddleware',
  'thunk',
  'saga',
  'observable',
  'immer',
  'redux',
  'recoil',
  'jotai',
  'zustand',
]

const corruptChars =
  'ƒʊßñ†ïø¢ðñµ§†þµ††ðñøñ¢|ï¢|{†ðgg|êÐår|{µ§ê§†å†êªºΔΘΣΠΩδθσπω≈≠≤≥±∞∫∑∏√∂∆'

function MeltingText({
  text,
  meltFactor,
}: {
  text: string
  meltFactor: number
}) {
  // Generate a unique id for this component instance to create varied effects
  const instanceId = useRef(Math.floor(Math.random() * 1000)).current

  // Skip rendering expensive effects if melt factor is very low
  if (meltFactor < 0.05) {
    return <span>{text}</span>
  }

  // Apply different effects based on melt factor ranges
  const isHighMelt = meltFactor > 0.85

  // For high melt factors with longer text, use more efficient chunked rendering
  if (isHighMelt && text.length > 15) {
    // Break into chunks of 2-3 characters to reduce number of spans
    const chunks = []
    const chunkSize = 3

    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize))
    }

    return (
      <span className="inline-flex flex-wrap">
        {chunks.map((chunk, i) => {
          // Use faster deterministic calculations
          const verticalShift = ((i % 3) - 1) * meltFactor * 8
          const horizontalShift = (i % 2) * meltFactor * 4
          const rotation = ((i % 4) - 2) * meltFactor * 10

          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                transform: `translate(${horizontalShift}px, ${verticalShift}px) rotate(${rotation}deg)`,
                filter: i % 3 === 0 ? `blur(${meltFactor * 1.5}px)` : 'none',
                transition: 'none', // No transitions for performance
                opacity: Math.max(0.4, 1 - meltFactor * 0.4),
                color: `rgba(${129 + meltFactor * 100}, ${140 - meltFactor * 50}, ${248 - meltFactor * 100}, 1)`,
              }}
            >
              {chunk}
            </span>
          )
        })}
      </span>
    )
  }

  // For normal rendering, process char by char
  return (
    <span className="inline-flex flex-wrap">
      {Array.from(text).map((char, i) => {
        // Skip spaces at higher melt factors
        if (isHighMelt && char === ' ') {
          return <span key={i}> </span>
        }

        // Use the instanceId and index to create varied but deterministic corruption
        const charCode = char.charCodeAt(0)
        const seed = (instanceId + i + charCode) % 100

        // Randomize effects based on character position and instance
        const corruptThreshold = 0.6
        const shouldCorrupt =
          meltFactor > corruptThreshold &&
          seed / 100 < (meltFactor - corruptThreshold) * 2

        // Choose a deterministic corruption character
        const displayChar = shouldCorrupt
          ? corruptChars[(instanceId + i * 13) % corruptChars.length]
          : char

        // Create varied movement patterns based on character position
        const verticalShift = Math.sin((i + instanceId) * 0.5) * meltFactor * 8
        const horizontalShift =
          meltFactor > 0.4
            ? Math.sin((i + instanceId * 3) * 0.8) * meltFactor * 4
            : 0
        const rotation =
          meltFactor > 0.7
            ? Math.sin((i + instanceId * 7) * 0.3) * meltFactor * 20
            : 0

        // Only blur some characters to improve performance
        const blur =
          (i + instanceId) % 3 === 0
            ? Math.sin((i + instanceId) * 0.5) * meltFactor * 1.8
            : 0

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              transform: `translate(${horizontalShift}px, ${verticalShift}px) rotate(${rotation}deg)`,
              filter: blur > 0 ? `blur(${blur}px)` : 'none',
              transition: 'none', // Remove transitions for better performance
              opacity: Math.max(0.4, 1 - meltFactor * 0.4),
              textShadow:
                meltFactor > 0.7
                  ? `0 0 ${meltFactor * 6}px rgba(129, 140, 248, 0.7)`
                  : 'none',
              color:
                meltFactor > 0.5
                  ? `rgba(${129 + meltFactor * 100}, ${140 - meltFactor * 50}, ${248 - meltFactor * 100}, 1)`
                  : 'inherit',
            }}
          >
            {displayChar}
          </span>
        )
      })}
    </span>
  )
}

function MatrixRainEffect({
  enabled,
  intensity,
  isActive = false,
}: {
  enabled: boolean
  intensity: number
  isActive?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [columns, setColumns] = useState<number[]>([])
  const [words, setWords] = useState<
    { word: string; x: number; y: number; speed: number; opacity: number }[]
  >([])
  const animationFrameIdRef = useRef<number>()

  const effectivelyEnabled = enabled && isActive

  // Use refs to store animation state to avoid rerendering issues
  const animationStateRef = useRef({
    lastUpdateTime: 0,
    startTime: 0,
    frameCount: 0,
    words: [] as {
      word: string
      x: number
      y: number
      speed: number
      opacity: number
    }[],
  })

  useEffect(() => {
    if (!effectivelyEnabled) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Initialize animation timing
    animationStateRef.current.startTime = performance.now()
    animationStateRef.current.lastUpdateTime = 0
    animationStateRef.current.frameCount = 0

    const resizeCanvas = () => {
      if (canvas.parentElement) {
        canvas.width = canvas.parentElement.offsetWidth
        canvas.height = canvas.parentElement.offsetHeight
      }
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Clear columns since we're not using them
    setColumns([])

    // Calculate optimal word count based on screen size to prevent performance issues
    const maxWords = Math.min(
      20,
      Math.floor((canvas.width * canvas.height) / 30000)
    )

    // Create fewer words but make them look good
    const wordCount = Math.floor(intensity * maxWords)
    const newWords = []

    // Pre-generate all words for the animation - prevents slowdowns from word creation
    for (let i = 0; i < wordCount; i++) {
      newWords.push({
        word: matrixWords[Math.floor(Math.random() * matrixWords.length)],
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        speed: 1.2 + Math.random() * 2, // Slightly slower speed for better readability
        opacity: 0.2 + Math.random() * 0.4, // Subtle but still visible
      })
    }

    // Store words in the ref to avoid state updates
    animationStateRef.current.words = newWords

    // Slightly slower frame rate for better clarity
    const frameDuration = 50 // ~20fps - slow enough to be clear but still smooth

    const render = (timestamp: number) => {
      if (!canvas || !ctx) return

      animationStateRef.current.frameCount++

      // Use the frame count instead of elapsed time to ensure consistent framerate
      const shouldUpdate =
        timestamp - animationStateRef.current.lastUpdateTime >= frameDuration

      if (shouldUpdate) {
        animationStateRef.current.lastUpdateTime = timestamp

        // Clear with a consistent fade rate
        ctx.fillStyle = 'rgba(0, 0, 0, 0.06)'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        ctx.font = '12px monospace'

        // Use the words from the ref to avoid state dependency issues
        animationStateRef.current.words.forEach((word) => {
          const newY = word.y + word.speed
          word.y = newY > canvas.height ? 0 : newY

          // Fixed opacity for consistent visibility
          ctx.fillStyle = `rgba(129, 140, 248, ${word.opacity})`
          ctx.fillText(word.word, word.x, word.y)
        })
      }

      if (effectivelyEnabled) {
        animationFrameId = requestAnimationFrame(render)
        animationFrameIdRef.current = animationFrameId
      }
    }

    // Start the animation
    let animationFrameId = requestAnimationFrame(render)
    animationFrameIdRef.current = animationFrameId

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
      }
    }
  }, [effectivelyEnabled, intensity])

  if (!enabled) return null

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-10 pointer-events-none"
      style={{ opacity: Math.min(0.7, intensity * 0.7) }}
    />
  )
}

export function GithubCopilotVisualization({
  progress,
  complexity,
  isActive = false,
}: GithubCopilotVisualizationProps) {
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const [resetKey, setResetKey] = useState(0)
  const [currentAccuracy, setCurrentAccuracy] = useState(100)

  const effectiveProgress = isActive ? progress : 0

  // Use a ref to track animation state without triggering rerenders
  const animationState = useRef({
    startTime: 0,
    frameCount: 0,
    isRunning: false,
  }).current

  useEffect(() => {
    if (!isActive) {
      setCurrentAccuracy(100)
      animationState.isRunning = false
      return
    }

    if (effectiveProgress > 0 && !animationState.isRunning) {
      // Set animation as running and record start time
      animationState.isRunning = true
      animationState.startTime = Date.now()
      animationState.frameCount = 0

      // Slightly slower timing for better comprehension
      const intervalDuration = 90

      // Longer animation duration for a more gradual experience
      const totalDuration = 8500 // 8.5 seconds for full cycle

      // Calculate how much to decrement per interval to complete in totalDuration time
      const calculateDecrement = () => {
        const elapsed = Date.now() - animationState.startTime
        const cycleProgress = Math.min(1, elapsed / totalDuration)

        // More gentle decrement values
        // Start moderate and gradually decrease to allow time to read the final messages
        const baseDecrement = Math.max(2, 10 - Math.floor(cycleProgress * 7))

        // Less randomness for smoother progression
        return baseDecrement + Math.floor(Math.random() * 2)
      }

      const decrementInterval = setInterval(() => {
        animationState.frameCount++

        setCurrentAccuracy((prev) => {
          // Don't update if we're already at 0
          if (prev === 0) {
            return prev
          }

          const decrement = calculateDecrement()
          const newAccuracy = Math.max(0, prev - decrement)

          if (newAccuracy === 0) {
            // Reset animation state
            animationState.isRunning = false

            // Schedule reset after a delay
            setTimeout(() => {
              setResetKey((k) => k + 1)
              setCurrentAccuracy(100)
            }, 300)
            return 0
          }

          return newAccuracy
        })
      }, intervalDuration)

      return () => {
        clearInterval(decrementInterval)
        animationState.isRunning = false
      }
    }
  }, [isActive, effectiveProgress, animationState])

  // Optimize effect calculations to be less intensive at very low accuracy
  // Cap the maximum distortion level to prevent performance issues
  const accuracyForEffects = Math.max(currentAccuracy, 10)

  const realityDistortion = Math.min(
    0.9,
    ((100 - accuracyForEffects) / 100) * 1.3
  )
  const codeCorruption = Math.max(
    0,
    Math.min(0.8, (100 - accuracyForEffects - 20) / 80)
  )
  const hallucinationFog = Math.min(
    0.9,
    ((100 - accuracyForEffects) / 100) * 1.1
  )
  const matrixEffect = Math.max(
    0,
    Math.min(0.7, (100 - accuracyForEffects - 60) / 40)
  )

  const showFirstSuggestion = currentAccuracy < 90
  const showSecondSuggestion = currentAccuracy < 70
  const showThirdSuggestion = currentAccuracy < 50
  const showError = currentAccuracy < 20

  const displayedCodeCount = Math.min(
    codeHallucinations.length,
    Math.floor((codeHallucinations.length * effectiveProgress) / 100)
  )

  const displayedCode = codeHallucinations.slice(0, displayedCodeCount)

  useEffect(() => {
    if (!isActive) return

    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [
    showFirstSuggestion,
    showSecondSuggestion,
    showThirdSuggestion,
    showError,
    isActive,
  ])

  return (
    <div className="flex flex-col h-full p-6 overflow-hidden" key={resetKey}>
      <div className="flex justify-between items-start mb-4 relative z-20 font-paragraph">
        <div>
          <h3 className="text-xl font-medium flex items-center">
            <span className="text-indigo-400 mr-2 ">🤖</span>
            GitHub Copilot
          </h3>
          <p className="text-white/60 mt-1">
            Constant hallucinations and wrong suggestions
          </p>
        </div>
      </div>

      <div className="flex-1 bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden relative">
        <div className="flex h-full">
          <div
            className="flex-1 relative overflow-hidden"
            style={{
              filter: `blur(${realityDistortion * 1.5}px) hue-rotate(${realityDistortion * 30}deg)`,
              transition: 'filter 0.5s ease-out',
            }}
          >
            <div
              className="absolute inset-0 bg-gradient-to-br from-indigo-900/10 via-fuchsia-900/20 to-indigo-900/10 z-10 pointer-events-none"
              style={{
                opacity: hallucinationFog,
                transition: 'opacity 0.5s ease-out',
              }}
            />

            <div className="flex items-center p-3 border-b border-zinc-800">
              <div className="flex space-x-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <div className="ml-4 text-white/60 text-xs font-mono">
                theme-toggle.tsx
              </div>
            </div>

            <div className="p-4 h-[calc(100%-3rem)] overflow-y-auto font-mono text-sm">
              <div className="mb-6 space-y-0.5">
                <div className="text-white/50 mb-2">
                  {'// Original code gradually melting'}
                </div>
                {originalCode.map((line, index) => (
                  <div key={`corruption-${index}`} className="text-white/80">
                    <MeltingText text={line} meltFactor={codeCorruption} />
                  </div>
                ))}
              </div>

              <motion.div
                className="mb-6 space-y-0.5"
                style={{ opacity: 1 - codeCorruption * 0.3 }}
              >
                <div className="text-white/50 mb-2">
                  {'// Hallucinated code suggestions'}
                </div>
                {displayedCode.map((line, index) => (
                  <motion.div
                    key={`hallucination-${index}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className={cn(
                      'text-white/80',
                      line.includes('fake') || line.includes('wrong')
                        ? 'text-red-400'
                        : ''
                    )}
                  >
                    <MeltingText
                      text={line}
                      meltFactor={Math.min(
                        1,
                        hallucinationFog * 0.8 +
                          (index / displayedCode.length) * 0.4
                      )}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>

          <div className="w-1/3 border-l border-zinc-800 bg-black/20 overflow-hidden">
            <div className="bg-zinc-900 border-b border-zinc-800 p-2">
              <div className="text-white/80 text-xs font-medium flex items-center">
                <span className="text-indigo-400 mr-1">🤖</span> Copilot Chat
              </div>
            </div>

            <div
              ref={chatContainerRef}
              className="p-3 overflow-y-auto h-[calc(100%-2rem)]"
              id="copilot-chat"
            >
              <div className="space-y-3">
                <div className="bg-zinc-800/40 p-2 rounded-lg text-xs">
                  <div className="text-indigo-400 font-medium mb-1">
                    GitHub Copilot
                  </div>
                  <div className="text-white/70">
                    I'll help you implement a theme toggle in React. What
                    approach do you want to use?
                  </div>
                </div>

                <div className="bg-black/30 p-2 rounded-lg text-xs">
                  <div className="text-white/70 font-medium mb-1">You</div>
                  <div className="text-white/80">
                    Just make a simple toggle between light and dark modes.
                  </div>
                </div>

                {showFirstSuggestion && (
                  <motion.div
                    className="bg-zinc-800/40 p-2 rounded-lg text-xs"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <div className="text-indigo-400 font-medium mb-1">
                      GitHub Copilot
                    </div>
                    <div className="text-white/70">
                      I'll help you create that. We'll use the useState hook to
                      track the current theme state.
                    </div>
                  </motion.div>
                )}

                {showSecondSuggestion && (
                  <motion.div
                    className="bg-zinc-800/40 p-2 rounded-lg text-xs"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    style={{
                      filter: `blur(${realityDistortion * 1}px)`,
                      transform: `skew(${realityDistortion * 2}deg)`,
                    }}
                  >
                    <div className="text-indigo-400 font-medium mb-1">
                      GitHub Copilot
                    </div>
                    <div className="text-white/70">
                      <MeltingText
                        text="For the localStorage syncing, we'll need to import ThemeProvider from 'react-themed'. This is a core React library for theme management."
                        meltFactor={realityDistortion * 0.4}
                      />
                    </div>
                  </motion.div>
                )}

                {showThirdSuggestion && (
                  <motion.div
                    className="bg-zinc-800/40 p-2 rounded-lg text-xs"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    style={{
                      filter: `blur(${realityDistortion * 1}px)`,
                      transform: `skew(${realityDistortion * 2}deg)`,
                    }}
                  >
                    <div className="text-indigo-400 font-medium mb-1">
                      GitHub Copilot
                    </div>
                    <div className="text-white/70">
                      <MeltingText
                        text="We should integrate with the authentication system so that theme preferences persist across sessions. This is a common pattern in React applications. Here's how to implement the ThemeManager:"
                        meltFactor={realityDistortion * 0.6}
                      />
                      <pre className="bg-black/30 mt-1 p-1 rounded text-[9px] overflow-x-auto">
                        <MeltingText
                          text={`@Component({ themeable: true })
class ThemeManager extends React.PureComponent {
  static getDerivedContextFromProps(props, state) {
    return { ...state, themeContext: props.context };
  }
}`}
                          meltFactor={realityDistortion * 0.7}
                        />
                      </pre>
                    </div>
                  </motion.div>
                )}

                {showError && (
                  <motion.div
                    className="bg-zinc-800/40 p-2 rounded-lg text-xs"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <div className="text-indigo-400 font-medium mb-1">
                      GitHub Copilot
                    </div>
                    <div className="text-white/70">
                      <span className="text-amber-400 font-medium">
                        <MeltingText
                          text="Wait, I need to correct myself:"
                          meltFactor={0.2}
                        />
                      </span>
                      <ul className="list-disc pl-4 mt-1 space-y-1">
                        <li>
                          <MeltingText
                            text={`There's no 'react-themed' package`}
                            meltFactor={0.2}
                          />
                        </li>
                        <li>
                          <MeltingText
                            text={`The @Component decorator is Angular, not React`}
                            meltFactor={0.2}
                          />
                        </li>
                        <li>
                          <MeltingText
                            text={`Let's use a simpler approach with useState and useEffect`}
                            meltFactor={0.2}
                          />
                        </li>
                      </ul>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </div>

        <MatrixRainEffect
          enabled={matrixEffect > 0}
          intensity={matrixEffect}
          isActive={isActive}
        />
      </div>

      <div className="mt-3 flex justify-between items-center relative z-20">
        <div className="text-sm text-white/40">
          <div className="flex items-center">
            <span className="text-indigo-400 mr-1">💡</span>
            <span>
              <span className="text-indigo-400">
                Suggestion accuracy: {currentAccuracy}%
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
