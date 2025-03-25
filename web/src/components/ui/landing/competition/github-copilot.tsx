import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useRef, useEffect, useState } from 'react'

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
  return (
    <span className="inline-flex flex-wrap">
      {Array.from(text).map((char, i) => {
        const corruptThreshold = 0.6
        const shouldCorrupt =
          meltFactor > corruptThreshold &&
          Math.random() < (meltFactor - corruptThreshold) * 2

        const displayChar = shouldCorrupt
          ? corruptChars[Math.floor(Math.random() * corruptChars.length)]
          : char

        const verticalShift = Math.sin(i * 0.5) * meltFactor * 8
        const horizontalShift =
          meltFactor > 0.4 ? Math.sin(i * 0.8) * meltFactor * 4 : 0
        const rotation =
          meltFactor > 0.7 ? Math.sin(i * 0.3) * meltFactor * 20 : 0

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

  useEffect(() => {
    if (!effectivelyEnabled) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resizeCanvas = () => {
      if (canvas.parentElement) {
        canvas.width = canvas.parentElement.offsetWidth
        canvas.height = canvas.parentElement.offsetHeight
      }
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    const columnCount = Math.floor(canvas.width / 20)
    const newColumns = Array(columnCount).fill(0)
    setColumns(newColumns)

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

    let animationFrameId: number

    const render = () => {
      if (!canvas || !ctx) return

      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.font = '12px monospace'

      const updatedWords = words.map((word) => {
        const newY = word.y + word.speed
        const y = newY > canvas.height ? 0 : newY
        ctx.fillStyle = `rgba(129, 140, 248, ${word.opacity})`
        ctx.fillText(word.word, word.x, y)
        return { ...word, y }
      })

      setWords(updatedWords)

      if (effectivelyEnabled) {
        animationFrameId = requestAnimationFrame(render)
        animationFrameIdRef.current = animationFrameId
      }
    }

    render()

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
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const [resetKey, setResetKey] = useState(0)
  const [currentAccuracy, setCurrentAccuracy] = useState(100)

  const effectiveProgress = isActive ? progress : 0

  useEffect(() => {
    if (!isActive) {
      setCurrentAccuracy(100)
      return
    }

    if (effectiveProgress > 0) {
      const decrementInterval = setInterval(() => {
        setCurrentAccuracy(prev => {
          const decrement = Math.floor(Math.random() * 10) + 1
          const newAccuracy = Math.max(0, prev - decrement)
          
          if (newAccuracy === 0) {
            setResetKey(k => k + 1)
            return 100
          }
          
          return newAccuracy
        })
      }, 100)

      return () => clearInterval(decrementInterval)
    }
  }, [isActive, effectiveProgress])

  const realityDistortion = Math.min(1, ((100 - currentAccuracy) / 100) * 1.5)
  const codeCorruption = Math.max(0, Math.min(1, ((100 - currentAccuracy) - 20) / 80))
  const hallucinationFog = Math.min(1, ((100 - currentAccuracy) / 100) * 1.2)
  const matrixEffect = Math.max(0, Math.min(1, ((100 - currentAccuracy) - 60) / 40))

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
                Suggestion accuracy:{' '}
                {currentAccuracy}%
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
