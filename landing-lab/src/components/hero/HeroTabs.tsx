import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  ImagePlus,
  Palette,
  SendHorizontal,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'

import type { TabId } from '@/lib/competitors'
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
                  'relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
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

      {/* Content area grows to fit the active panel (height eases between tabs) */}
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 360, damping: 34 }}
        className="mx-auto mt-4 w-full max-w-xl"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {tab === 'cli' && <CliPanel />}
            {tab === 'web' && <WebPanel />}
            {tab === 'chat' && <ChatPanel />}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
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

      {/* Setup guide toggle — lives BELOW the command, fills the reserved height */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-3 flex items-center gap-1.5 text-[13px] text-white/45 transition-colors hover:text-white"
      >
        <span>Setup guide</span>
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
            className="mt-2 space-y-1.5 overflow-hidden font-mono text-[13px] text-white/55"
          >
            <li>
              <span className="text-white/30">1</span>&nbsp;&nbsp;cd your-project
            </li>
            <li>
              <span className="text-white/30">2</span>&nbsp;&nbsp;freebuff
            </li>
            <li className="pt-0.5 font-sans text-white/40">
              No API key, no sign-up. It just runs.
            </li>
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
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
          <SendHorizontal className="h-4 w-4" />
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
      <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-3">
        <input
          placeholder="Ask Freebuff anything…"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none"
        />
        <button
          aria-label="Send"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-forest text-white transition-colors hover:bg-forest/90"
        >
          <SendHorizontal className="h-4 w-4" />
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
