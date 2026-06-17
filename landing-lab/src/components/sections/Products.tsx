import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  ImagePlus,
  Palette,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { BrandLogo } from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
import type { Competitor, TabId } from '@/lib/competitors'
import { COMPETITORS_BY_TAB } from '@/lib/competitors'
import { cn } from '@/lib/utils'

/* ── Shared demo frame — every product demo gets identical chrome + size ─── */
function DemoFrame({
  title,
  terminal,
  children,
}: {
  title: string
  terminal?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex h-[380px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c0f] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        {terminal ? (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/80" />
          </span>
        ) : (
          <img src="/logo-icon.png" alt="" className="h-4 w-4 rounded-[3px]" />
        )}
        <span className="ml-1 text-[12px] text-white/45">{title}</span>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}

/* ── CLI demo — typing animation over the real freebuff agent loop ───────── */
const CLI_PROMPTS = [
  'add google login to my app',
  'fix the failing checkout test',
  'refactor the dashboard to use server components',
]

function TerminalDemo() {
  const [typed, setTyped] = useState('')
  const [promptIdx, setPromptIdx] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const prompt = CLI_PROMPTS[promptIdx]
    setTyped('')
    setDone(false)
    let i = 0
    const type = setInterval(() => {
      i += 1
      setTyped(prompt.slice(0, i))
      if (i >= prompt.length) {
        clearInterval(type)
        setDone(true)
      }
    }, 45)
    const next = setTimeout(
      () => setPromptIdx((p) => (p + 1) % CLI_PROMPTS.length),
      6200,
    )
    return () => {
      clearInterval(type)
      clearTimeout(next)
    }
  }, [promptIdx])

  return (
    <DemoFrame title="freebuff — zsh" terminal>
      <div className="flex h-full flex-col px-4 py-3.5 font-mono text-[13px] leading-relaxed">
        <div className="mb-2.5 flex items-center justify-between text-[11px] text-white/30">
          <span className="font-semibold text-forest-bright/80">◆ freebuff</span>
          <span>MiniMax M3 · ~/my-app</span>
        </div>
        <p className="text-white/85">
          <span className="text-forest-bright">›</span> {typed}
          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-forest-bright align-middle" />
        </p>
        <AnimatePresence mode="wait">
          {done && (
            <motion.div
              key={promptIdx}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-1.5 pt-2"
            >
              <Step delay={0}>Read 142 files · mapped the auth flow</Step>
              <Step delay={0.5}>
                Edit <span className="text-white/80">src/auth/google.ts</span>{' '}
                <span className="text-forest-bright/70">+24 -3</span>
              </Step>
              <Step delay={1}>
                Edit <span className="text-white/80">login-button.tsx</span>{' '}
                <span className="text-forest-bright/70">+8 -1</span>
              </Step>
              <Step delay={1.5}>code-reviewer subagent · looks good</Step>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2 }}
                className="pt-1 text-white/70"
              >
                Done in 11s · 2 files changed
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.4 }}
                className="pt-2 text-[11px] text-white/25"
              >
                — sponsored — Ship faster with Vercel. vercel.com
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DemoFrame>
  )
}

function Step({
  children,
  delay,
}: {
  children: React.ReactNode
  delay: number
}) {
  return (
    <motion.p
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="text-white/60"
    >
      <span className="text-forest-bright">✔</span> {children}
    </motion.p>
  )
}

/* ── Web demo — a clean replica of the real Freebuff Web builder ─────────── */
const WEB_STEPS = [
  'Read files · List directory',
  'Spawn agent · Reasoning',
  'Set output · Run terminal',
]

function WebAppDemo() {
  return (
    <DemoFrame title="Freebuff Web">
      <div className="flex h-full flex-col">
        {/* App toolbar */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] text-white/45">
            <span className="rounded bg-forest/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-forest-bright">
              Beta
            </span>
            <span className="text-white/70">AI Waitlist Builder</span>
          </div>
          <span className="flex items-center gap-1 rounded-md bg-forest px-2 py-1 text-[10px] font-semibold text-white">
            Publish
          </span>
        </div>

        {/* Split: thread + live preview */}
        <div className="flex min-h-0 flex-1">
          {/* Chat thread */}
          <div className="flex w-[44%] flex-col border-r border-white/[0.06]">
            <div className="flex-1 space-y-1.5 overflow-hidden p-3">
              {WEB_STEPS.map((s) => (
                <div
                  key={s}
                  className="flex items-center gap-1.5 truncate text-[11px] text-white/45"
                >
                  <Check className="h-3 w-3 shrink-0 text-forest-bright" />
                  <span className="truncate">{s}</span>
                </div>
              ))}
              <div className="!mt-3 flex flex-wrap gap-1.5">
                {['Hook up Resend', 'Verify domain'].map((c) => (
                  <span
                    key={c}
                    className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/45"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div className="border-t border-white/[0.06] p-2.5">
              <div className="rounded-lg bg-white/[0.04] p-2">
                <p className="px-1 text-[11px] text-white/35">Message…</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[10px] text-white/45">
                    <Sparkles className="h-3 w-3" /> MiniMax M3
                  </span>
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-forest text-white">
                    <ArrowUp className="h-3 w-3" />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="flex flex-1 flex-col bg-[#08080a]">
            <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-3 py-1.5">
              <RefreshCw className="h-3 w-3 text-white/30" />
              <span className="flex-1 truncate rounded bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/35">
                waitlist.freebuff.app
              </span>
            </div>
            <div className="flex-1 space-y-2.5 overflow-hidden p-4">
              <div className="h-2.5 w-1/2 rounded bg-white/10" />
              <div className="h-2 w-3/4 rounded bg-white/[0.06]" />
              <div className="mt-3 h-7 w-28 rounded-md bg-forest/70" />
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-12 rounded-lg border border-white/[0.06] bg-white/[0.03]"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DemoFrame>
  )
}

/* ── Chat demo — interactive research assistant (ChatGPT-style prompts) ──── */
type Msg = { role: 'user' | 'assistant'; text: string; points?: string[] }
const CHAT_EXAMPLES = [
  'Compare Postgres vs MongoDB for a SaaS',
  'Explain how OAuth 2.0 works',
  'Research the best AI coding agents in 2026',
]
const CHAT_REPLY = {
  text: 'For most SaaS products, Postgres is the safer default — but it depends on your data shape:',
  points: [
    'Postgres: relational integrity, rich querying, JSONB when you need flexibility.',
    'MongoDB: best when documents are truly schema-less and write-heavy.',
  ],
}

function ChatDemo() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [typing, setTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const ask = (text: string) => {
    setMessages([{ role: 'user', text }])
    setTyping(true)
    setTimeout(() => {
      setTyping(false)
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: CHAT_REPLY.text, points: CHAT_REPLY.points },
      ])
    }, 1100)
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 9999, behavior: 'smooth' })
  }, [messages, typing])

  return (
    <DemoFrame title="Freebuff Chat">
      <div className="flex h-full flex-col">
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto p-4 text-[13px]"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-white/40">Try asking…</p>
            <div className="flex flex-col gap-2">
              {CHAT_EXAMPLES.map((e) => (
                <button
                  key={e}
                  onClick={() => ask(e)}
                  className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-white/60 transition-colors hover:border-forest/40 hover:text-white"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div
              key={i}
              className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-white/[0.06] px-3 py-2 text-white/80"
            >
              {m.text}
            </div>
          ) : (
            <div
              key={i}
              className="w-fit max-w-[90%] rounded-2xl rounded-bl-sm bg-forest/[0.12] px-3 py-2 leading-relaxed text-white/75"
            >
              {m.text}
              {m.points && (
                <ul className="mt-2 space-y-1.5">
                  {m.points.map((pt) => (
                    <li key={pt} className="flex gap-2 text-white/60">
                      <span className="text-forest-bright">•</span>
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ),
        )}
        {typing && (
          <div className="flex items-center gap-2 text-white/30">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-forest-bright" />
            <span className="text-[11px]">Freebuff is typing…</span>
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5">
          <span className="flex-1 text-white/30">Ask Freebuff anything…</span>
          <button
            onClick={() => ask(CHAT_EXAMPLES[0])}
            aria-label="Send"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-forest text-white"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
      </div>
    </DemoFrame>
  )
}

/* ── Competitor logo wall — real logos, no cards ────────────────────────── */
function CompetitorGrid({ items }: { items: Competitor[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-7 gap-y-5 sm:grid-cols-3">
      {items
        .filter((c) => !c.freebuff)
        .map((c) => (
          <div key={c.name} className="flex items-center gap-3">
            <BrandLogo
              name={c.name}
              mark={c.mark}
              slug={c.slug}
              domain={c.domain}
              logo={c.logo}
              size={26}
            />
            <div className="truncate text-[14px] font-medium text-white/85">
              {c.name}
            </div>
          </div>
        ))}
    </div>
  )
}

/* ── Section ────────────────────────────────────────────────────────────── */
type Product = {
  id: string
  tab: TabId
  eyebrow: string
  title: React.ReactNode
  description: string
  demo: React.ReactNode
  reverse?: boolean
}

const PRODUCTS: Product[] = [
  {
    id: 'cli',
    tab: 'cli',
    eyebrow: 'Freebuff CLI',
    title: (
      <>
        Introducing <span className="text-forest-bright">Freebuff CLI</span>
      </>
    ),
    description: 'A 100% free coding agent, right from your terminal.',
    demo: <TerminalDemo />,
  },
  {
    id: 'web',
    tab: 'web',
    eyebrow: 'Freebuff Web',
    title: (
      <>
        Introducing <span className="text-forest-bright">Freebuff Web</span>
      </>
    ),
    description: '100% free AI web app builder — from prompt to deployed app.',
    demo: <WebAppDemo />,
    reverse: true,
  },
  {
    id: 'chat',
    tab: 'chat',
    eyebrow: 'Freebuff Chat',
    title: (
      <>
        Introducing <span className="text-forest-bright">Freebuff Chat</span>
      </>
    ),
    description: 'A free AI chat that reads your repo, researches, and codes.',
    demo: <ChatDemo />,
  },
]

/* ── CLI install — copy button + the full getting-started steps ─────────── */
function InstallBlock() {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText('npm install -g freebuff')
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="w-full max-w-sm">
      <button
        onClick={copy}
        className="group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left font-mono text-sm transition-colors hover:border-white/20"
      >
        <span className="select-none text-forest-bright">$</span>
        <span className="flex-1 text-white/90">npm install -g freebuff</span>
        {copied ? (
          <Check className="h-4 w-4 text-forest-bright" />
        ) : (
          <Copy className="h-4 w-4 text-white/40 transition-colors group-hover:text-white" />
        )}
      </button>

      <ol className="mt-3 space-y-1.5 font-mono text-[13px] text-white/55">
        <li>
          <span className="select-none text-white/30">$</span>&nbsp; cd
          your-project
        </li>
        <li>
          <span className="select-none text-white/30">$</span>&nbsp; freebuff
        </li>
      </ol>
      <p className="mt-2 text-[13px] text-white/40">
        No API key, no sign-up. It just runs.
      </p>
    </div>
  )
}

function ProductRow({ p }: { p: Product }) {
  return (
    <div
      id={p.id}
      className="grid scroll-mt-24 items-center gap-10 py-16 md:grid-cols-2 md:gap-16 md:py-24"
    >
      {/* Text side — no bg, no border, no card */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.5 }}
        className={cn(p.reverse && 'md:order-2')}
      >
        <div className="mb-3 flex items-center gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-forest-bright/90">
            {p.eyebrow}
          </p>
          <span className="rounded-full border border-forest/40 bg-forest/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-forest-bright">
            New
          </span>
        </div>
        <h2 className="hero-heading text-3xl font-normal text-white md:text-[40px] md:leading-[1.1]">
          {p.title}
        </h2>
        <p className="mt-4 max-w-md text-lg text-white/55">{p.description}</p>

        <div className="mt-7">
          <p className="mb-3 text-xs uppercase tracking-wider text-white/35">
            Replaces these paid tools
          </p>
          <CompetitorGrid items={COMPETITORS_BY_TAB[p.tab]} />
        </div>

        <div className="mt-8">
          {p.tab === 'cli' ? (
            <InstallBlock />
          ) : (
            <Button variant="default" size="lg">
              Get started
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </motion.div>

      {/* Demo side */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className={cn(p.reverse && 'md:order-1')}
      >
        {p.demo}
      </motion.div>
    </div>
  )
}

export function Products() {
  return (
    <section className="relative z-30 -mt-[34vh] bg-black px-6 py-10 md:-mt-[38vh]">
      <div className="mx-auto max-w-6xl divide-y divide-white/[0.06]">
        {PRODUCTS.map((p) => (
          <ProductRow key={p.id} p={p} />
        ))}
      </div>
    </section>
  )
}
