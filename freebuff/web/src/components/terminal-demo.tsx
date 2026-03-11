'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'

const DEMO_LINES = [
  { type: 'prompt', text: '$ freebuff' },
  { type: 'output', text: '  Welcome to Freebuff — the free AI coding agent' },
  { type: 'output', text: '' },
  { type: 'user', text: '> add dark mode support to the settings page' },
  { type: 'output', text: '' },
  { type: 'agent', text: '  Scanning project structure... found 42 files' },
  { type: 'agent', text: '  Reading settings/page.tsx, theme-provider.tsx' },
  { type: 'agent', text: '  ✓ Added ThemeToggle component' },
  { type: 'agent', text: '  ✓ Updated settings page with dark mode switch' },
  { type: 'agent', text: '  ✓ Extended theme-provider with system preference' },
  { type: 'output', text: '' },
  { type: 'success', text: '  Done — 3 files edited, 0 errors' },
] as const

const LINE_DELAY = 400
const INITIAL_DELAY = 1200

export function TerminalDemo() {
  const [visibleLines, setVisibleLines] = useState(0)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []

    DEMO_LINES.forEach((_, i) => {
      timers.push(
        setTimeout(
          () => setVisibleLines(i + 1),
          INITIAL_DELAY + i * LINE_DELAY,
        ),
      )
    })

    return () => timers.forEach(clearTimeout)
  }, [])

  const getLineColor = (type: string) => {
    switch (type) {
      case 'prompt':
        return 'text-acid-matrix'
      case 'user':
        return 'text-white font-medium'
      case 'agent':
        return 'text-zinc-300'
      case 'success':
        return 'text-acid-matrix font-medium'
      default:
        return 'text-zinc-500'
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.6, ease: [0.165, 0.84, 0.44, 1] }}
      className="relative mx-auto max-w-2xl"
    >
      {/* Glow behind terminal */}
      <div className="absolute -inset-4 bg-acid-matrix/[0.03] blur-2xl rounded-3xl" />

      <div className="relative rounded-xl border border-zinc-800/80 bg-zinc-950/90 backdrop-blur-sm overflow-hidden shadow-2xl shadow-black/50">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800/60 bg-zinc-900/50">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-zinc-700/80" />
            <div className="h-3 w-3 rounded-full bg-zinc-700/80" />
            <div className="h-3 w-3 rounded-full bg-zinc-700/80" />
          </div>
          <span className="text-xs text-zinc-500 font-mono ml-2">
            ~/my-project
          </span>
        </div>

        {/* Terminal content */}
        <div className="p-4 font-mono text-sm leading-relaxed min-h-[280px]">
          <AnimatePresence>
            {DEMO_LINES.slice(0, visibleLines).map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className={getLineColor(line.type)}
              >
                {line.text || '\u00A0'}
              </motion.div>
            ))}
          </AnimatePresence>
          {visibleLines < DEMO_LINES.length && (
            <span className="inline-block w-2 h-4 bg-acid-matrix/70 animate-terminal-cursor" />
          )}
        </div>
      </div>
    </motion.div>
  )
}
