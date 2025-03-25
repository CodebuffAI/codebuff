import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useRef, useEffect, useState } from 'react'

interface GithubCopilotVisualizationProps {
  progress: number
  complexity: 'simple' | 'full'
  isActive?: boolean
}

// Nonsense code that gradually appears to simulate hallucinations
const codeHallucinations = [
  "import React from 'react';",
  "import { useState } from 'react';",
  "import { ThemeToggle } from 'react-themed';", // Fake
  "import { configureTheme } from 'theme-context';", // Fake
  'import pandas as pd;', // Completely wrong language
  'from sklearn.model_selection import train_test_split', // Wrong language
  'const syncThemeWithServer = async (theme) => {',
  "  await fetch('https://api.auth.io/v2/preferences');",
  '};',
  '@Component({ themeable: true })', // Angular syntax in React
  'class ThemeManager extends React.PureComponent {', // Mixed paradigms
  '  static getDerivedContextFromProps(props, state) {', // Fake lifecycle method
  '    return { ...state, themeContext: props.context };',
  '  }',
  '  render() {',
  '    return <ThemeContext.Provider value={this.state.theme}>',
  '      {this.props.children}',
  '    </ThemeContext.Provider>;',
  '  }',
  '}',
]

// Original clean code
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

// Random words for matrix effect
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

// Collection of weird unicode characters for progressive corruption
const corruptChars =
  'ƒʊßñ†ïø¢ðñµ§†þµ††ðñøñ¢|ï¢|{†ðgg|êÐår|{µ§ê§†å†êªºΔΘΣΠΩδθσπω≈≠≤≥±∞∫∑∏√∂∆'

// Component for melting text that gradually becomes more garbled
function MeltingText({
  text,
  meltFactor,
}: {
  text: string
  meltFactor: number
}) {
  // Split text into individual characters for the melting effect
  return (
    <span className="inline-flex flex-wrap">
      {Array.from(text).map((char, i) => {
        // Determine if this character should be replaced with a corrupt version
        // Higher meltFactor means more characters get corrupted
        const corruptThreshold = 0.6 // Start corrupting characters when meltFactor > 0.6
        const shouldCorrupt =
          meltFactor > corruptThreshold &&
          Math.random() < (meltFactor - corruptThreshold) * 2 // Randomize which chars get corrupted

        // If corrupting, pick a random char from our corruption set
        const displayChar = shouldCorrupt
          ? corruptChars[Math.floor(Math.random() * corruptChars.length)]
          : char

        // Add more extreme effects as melt factor increases
        const verticalShift = Math.sin(i * 0.5) * meltFactor * 8 // Increased shift
        const horizontalShift =
          meltFactor > 0.4 ? Math.sin(i * 0.8) * meltFactor * 4 : 0 // Add horizontal warping
        const rotation =
          meltFactor > 0.7 ? Math.sin(i * 0.3) * meltFactor * 20 : 0 // Add rotation when melting is severe

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              transform: `translate(${horizontalShift}px, ${verticalShift}px) rotate(${rotation}deg)`,
              filter: `blur(${Math.sin(i * 0.5 + 1) * meltFactor * 1.8}px)`,
              transition:
                'transform 0.8s ease-out, filter 0.8s ease-out, color 0.8s ease-out',
              opacity: Math.max(0.4, 1 - meltFactor * 0.4),
              textShadow: `0 0 ${meltFactor * 6}px rgba(129, 140, 248, 0.7)`,
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

// Function to generate a matrix-like falling code effect
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

  // Only enable when component is both enabled and active
  const effectivelyEnabled = enabled && isActive

  useEffect(() => {
    if (!effectivelyEnabled) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Resize canvas to fit container
    const resizeCanvas = () => {
      if (canvas.parentElement) {
        canvas.width = canvas.parentElement.offsetWidth
        canvas.height = canvas.parentElement.offsetHeight
      }
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Initialize columns for the rain effect
    const columnCount = Math.floor(canvas.width / 20)
    const newColumns = Array(columnCount).fill(0)
    setColumns(newColumns)

    // Initialize words
    const wordCount = Math.floor(intensity * 15)
    const newWords = []

    for (let i = 0; i < wordCount; i++) {
      newWords.push({
        word: matrixWords[Math.floor(Math.random() * matrixWords.length)],
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        speed: 1 + Math.random() * 3,
        opacity: 0.1 + Math.random() * 0.5,
      })
    }

    setWords(newWords)

    // Animation frame
    let animationFrameId: number

    const render = () => {
      if (!canvas || !ctx) return

      // Clear canvas with a semi-transparent black
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Set text properties
      ctx.font = '12px monospace'

      // Draw each word
      const updatedWords = words.map((word) => {
        // Move word down
        const newY = word.y + word.speed

        // Reset if it goes off screen
        const y = newY > canvas.height ? 0 : newY

        // Draw word
        ctx.fillStyle = `rgba(129, 140, 248, ${word.opacity})` // Indigo color with word's opacity
        ctx.fillText(word.word, word.x, y)

        return { ...word, y }
      })

      setWords(updatedWords)

      // Continue animation only if still active
      if (effectivelyEnabled) {
        animationFrameId = requestAnimationFrame(render)
        animationFrameIdRef.current = animationFrameId
      }
    }

    render()

    // Cleanup
    return () => {
      window.removeEventListener('resize', resizeCanvas)
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
      }
    }
  }, [effectivelyEnabled, intensity, words])

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
  // Reference for chat container to enable auto-scrolling
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // Calculate hallucination levels based on progress, but only when active
  const effectiveProgress = isActive ? progress : 0

  // Calculate hallucination levels based on active progress
  const realityDistortion = Math.min(1, (effectiveProgress / 100) * 1.5) // Maxes out at 1 when progress is ~67%
  const codeCorruption = Math.max(0, Math.min(1, (effectiveProgress - 20) / 80)) // Starts at progress 20, maxes at 100
  const hallucinationFog = Math.min(1, (effectiveProgress / 100) * 1.2) // Maxes out at 1 when progress is ~83%
  const matrixEffect = Math.max(0, Math.min(1, (effectiveProgress - 60) / 40)) // Starts at progress 60, maxes at 100

  // Control UI elements appearance based on progress
  const showFirstSuggestion = effectiveProgress > 10
  const showSecondSuggestion = effectiveProgress > 30
  const showThirdSuggestion = effectiveProgress > 50
  const showError = effectiveProgress > 80

  // Calculate displayed code for hallucinations
  const displayedCodeCount = Math.min(
    codeHallucinations.length,
    Math.floor((codeHallucinations.length * effectiveProgress) / 100)
  )

  const displayedCode = codeHallucinations.slice(0, displayedCodeCount)

  // Auto-scroll chat container when new messages appear, but only when active
  useEffect(() => {
    if (!isActive) return

    // Scroll the chat container to the bottom smoothly when messages change
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
    <div className="flex flex-col h-full p-6 overflow-hidden">
      <div className="flex justify-between items-start mb-4 relative z-20">
        <div>
          <h3 className="text-xl font-medium flex items-center">
            <span className="text-indigo-400 mr-2">🤖</span>
            GitHub Copilot
          </h3>
          <p className="text-white/60 mt-1">
            Constant hallucinations and wrong suggestions
          </p>
        </div>
      </div>

      {/* Main content area with reality distortion and corruption effects */}
      <div className="flex-1 bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden relative">
        <div className="flex h-full">
          {/* Code editor area with reality distortion effect */}
          <div
            className="flex-1 relative overflow-hidden"
            style={{
              filter: `blur(${realityDistortion * 1.5}px) hue-rotate(${realityDistortion * 30}deg)`,
              transition: 'filter 0.5s ease-out',
            }}
          >
            {/* Hallucination fog overlay */}
            <div
              className="absolute inset-0 bg-gradient-to-br from-indigo-900/10 via-fuchsia-900/20 to-indigo-900/10 z-10 pointer-events-none"
              style={{
                opacity: hallucinationFog,
                transition: 'opacity 0.5s ease-out',
              }}
            />

            {/* Editor header */}
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

            {/* Code content with corruption effect */}
            <div className="p-4 h-[calc(100%-3rem)] overflow-y-auto font-mono text-sm">
              {/* Original code that gradually melts and becomes corrupted */}
              <div className="mb-6 space-y-0.5">
                <div className="text-white/50 mb-2">
                  {'// Original code gradually melting'}
                </div>
                {originalCode.map((line, index) => (
                  <div key={`corruption-${index}`} className="text-white/80">
                    {/* Apply increasing melt factor to each line */}
                    <MeltingText text={line} meltFactor={codeCorruption} />
                  </div>
                ))}
              </div>

              {/* Hallucinated code that appears over time and melts */}
              <motion.div
                className="mb-6 space-y-0.5"
                style={{ opacity: 1 - codeCorruption * 0.3 }} // Fade out slightly as corruption increases
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
                    {/* Apply increasing melt factor based on progress and line index */}
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

          {/* Copilot Chat sidebar - kept from original */}
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
              {/* Chat messages */}
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

        {/* Matrix-style code rain effect */}
        <MatrixRainEffect
          enabled={matrixEffect > 0}
          intensity={matrixEffect}
          isActive={isActive}
        />
      </div>

      {/* Status indicators */}
      <div className="mt-3 flex justify-between items-center relative z-20">
        <div className="text-sm text-white/40">
          <div className="flex items-center">
            <span className="text-indigo-400 mr-1">💡</span>
            <span>
              <span className="text-indigo-400">
                Suggestion accuracy:{' '}
                {Math.max(0, 100 - Math.round(realityDistortion * 100))}%
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
