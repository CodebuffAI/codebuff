'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  ImagePlus,
  Palette,
  Sparkles,
} from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'

import type { TabId } from '../lib/competitors'

import { cn } from '@/lib/utils'

const TABS: {
  id: TabId
  label: string
  blurb: string
  toDashboard?: boolean
}[] = [
  { id: 'cli', label: 'CLI', blurb: 'The free coding agent for your terminal.' },
  {
    id: 'web',
    label: 'Web',
    blurb: 'The free AI web app builder.',
    toDashboard: true,
  },
  {
    id: 'chat',
    label: 'Chat',
    blurb: 'The free research assistant.',
    toDashboard: true,
  },
]

// Flip to true to preview the signed-in affordances (dashboard shortcut icons).
const LOGGED_IN = false

export function HeroTabs({
  tab,
  onTab,
}: {
  tab: TabId
  onTab: (t: TabId) => void
}) {
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]

  return (
    <div className="w-full">
      {/* Tab strip — text buttons, light pill on hover, filled pill when active */}
      <div className="mx-auto flex w-fit items-center gap-1 rounded-full p-1">
        {TABS.map((t) => {
          const isActive = t.id === tab
          return (
            <div key={t.id} className="flex items-center">
              <button
                onClick={() => onTab(t.id)}
                className={cn(
                  'relative rounded-full px-4 py-1.5 text-sm font-normal transition-colors',
                  isActive
                    ? 'text-white'
                    : 'text-white/55 hover:bg-white/[0.06] hover:text-white/90',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="tab-pill"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    className="absolute inset-0 -z-10 rounded-full bg-white/10"
                  />
                )}
                {t.label}
              </button>
              {LOGGED_IN && t.toDashboard && isActive && (
                <a
                  href="#"
                  aria-label="Open dashboard"
                  className="ml-1 flex h-6 w-6 items-center justify-center rounded-full bg-forest/20 text-forest-bright transition-colors hover:bg-forest/30"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )
        })}
      </div>

      {/* Faint per-product description (fixed height so nothing jumps) */}
      <div className="mt-2 flex h-5 items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={active.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="text-[13px] text-white/40"
          >
            {active.blurb}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Content area animates its REAL height between tabs, so everything
          below it (the parallax scene) glides down/up instead of snapping.
          A transform-based `layout` animation wouldn't push the siblings. */}
      <AnimatedTabHeight tabKey={tab}>
        {tab === 'cli' && <CliPanel />}
        {tab === 'web' && <WebPanel />}
        {tab === 'chat' && <ChatPanel />}
      </AnimatedTabHeight>
    </div>
  )
}

/* Wraps the active tab panel and eases its container height to the measured
   content height. The inner crossfade pops the outgoing panel out of flow so
   the height tracks only the incoming panel. */
function AnimatedTabHeight({
  tabKey,
  children,
}: {
  tabKey: TabId
  children: React.ReactNode
}) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | 'auto'>('auto')

  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    const measure = () => setHeight(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <motion.div
      initial={false}
      animate={{ height }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      style={{ overflow: 'hidden' }}
      className="mx-auto mt-4 w-full max-w-xl"
    >
      <div ref={innerRef} className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={tabKey}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

/* ── CLI: compact install command + setup guide collapse below ──────────── */
function CliPanel() {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)

  const copy = () => {
    navigator.clipboard?.writeText('npm install -g freebuff')
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="text-left">
      {/* Compact command box (fixed) */}
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 font-mono text-sm">
        <span className="select-none text-forest-bright">$</span>
        <span className="flex-1 text-white/90">npm install -g freebuff</span>
        <button
          onClick={copy}
          aria-label="Copy"
          className="text-white/40 transition-colors hover:text-white"
        >
          {copied ? (
            <Check className="h-4 w-4 text-forest-bright" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Install-guide toggle — lives BELOW the command, fills reserved height */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-3 flex items-center gap-1.5 text-[13px] text-white/45 transition-colors hover:text-white"
      >
        <span>Install guide</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="mt-3 space-y-2.5 overflow-hidden"
          >
            <GuideStep cmd="cd your-project" desc="Open your project folder" />
            <GuideStep cmd="freebuff" desc="Start coding — no API key, no sign-up" />
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  )
}

/* One faint, minimal guide line: mono command + a short description. */
function GuideStep({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <li className="flex flex-col gap-0.5">
      <span className="font-mono text-[13px] text-white/70">
        <span className="select-none text-forest-bright/70">$</span> {cmd}
      </span>
      <span className="text-[12px] text-white/35">{desc}</span>
    </li>
  )
}

/* ── Web: mini build composer (model + theme + suggestions) ─────────────── */
const BUILD_CHIPS = [
  'Waitlist landing page',
  'Support ticket system',
  'Blog',
  'Booking app',
]

function WebPanel() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left">
      <textarea
        rows={2}
        defaultValue=""
        placeholder="Ask Freebuff to create…"
        className="h-[52px] w-full resize-none bg-transparent px-2 pt-1 text-sm text-white placeholder:text-white/35 focus:outline-none"
      />
      <div className="mt-1 flex items-center gap-1.5">
        <Pill icon={ImagePlus} label="Image" />
        <Pill icon={Palette} label="Minimalism" caret />
        <Pill icon={Sparkles} label="MiniMax M3" caret />
        <button
          aria-label="Send"
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-forest text-white transition-colors hover:bg-forest/90"
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {BUILD_CHIPS.map((c) => (
          <SuggestChip key={c}>{c}</SuggestChip>
        ))}
      </div>
    </div>
  )
}

/* ── Chat: simple ask box + example prompts ─────────────────────────────── */
const CHAT_CHIPS = [
  'Compare Postgres vs MongoDB',
  'Explain how OAuth 2.0 works',
  'Best AI coding agents in 2026',
  'Summarize this paper',
]

function ChatPanel() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left">
      {/* Composer line — flat (no nested card), with a live blinking caret. */}
      <div className="flex min-h-[34px] items-center gap-1.5 px-2 pt-1 text-sm">
        <span
          aria-hidden
          className="lp-caret-blink h-[18px] w-[2px] rounded-full bg-forest-bright"
        />
        <span className="text-white/60">Ask Freebuff anything…</span>
      </div>
      {/* Controls row mirrors the Web composer: model selector + arrow send. */}
      <div className="mt-1 flex items-center gap-1.5">
        <Pill icon={Sparkles} label="MiniMax M3" caret />
        <button
          aria-label="Send"
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-forest text-white transition-colors hover:bg-forest/90"
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {CHAT_CHIPS.map((c) => (
          <SuggestChip key={c}>{c}</SuggestChip>
        ))}
      </div>
    </div>
  )
}

/* ── small shared bits ──────────────────────────────────────────────────── */
function Pill({
  icon: Icon,
  label,
  caret,
}: {
  icon: typeof ImagePlus
  label: string
  caret?: boolean
}) {
  return (
    <button className="flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/65 transition-colors hover:border-white/20 hover:text-white">
      <Icon className="h-3.5 w-3.5" />
      {label}
      {caret && <ChevronDown className="h-3 w-3 text-white/40" />}
    </button>
  )
}

function SuggestChip({ children }: { children: React.ReactNode }) {
  return (
    <button className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-xs text-white/55 transition-colors hover:border-forest/40 hover:text-white">
      {children}
    </button>
  )
}
