'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import { Check, ChevronDown, Copy } from 'lucide-react'
import { useRef, useState } from 'react'

import { Starfield } from '../Starfield'
import { CostBarChart } from '../hero/CostBarChart'

import { cn } from '@/lib/utils'

/**
 * CLI-only hero. Mirrors the homepage hero's layered parallax scene, but the
 * copy, CTA, and cost chart are all locked to the CLI product. Page scrolls
 * naturally; the only scroll-linked motion is the relative drift between the
 * background layers, the cost chart, and the foreground bushes.
 */
export function CliHero() {
  const sceneRef = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: sceneRef,
    offset: ['start end', 'end start'],
  })

  const starsY = useTransform(scrollYProgress, [0, 1], ['0vh', '150vh'])
  const skyY = useTransform(scrollYProgress, [0, 1], ['0vh', '95vh'])
  const hillsY = useTransform(scrollYProgress, [0, 1], ['0vh', '34vh'])
  const chartY = useTransform(scrollYProgress, [0, 1], ['0vh', '14vh'])
  const bushesY = useTransform(scrollYProgress, [0, 1], ['0vh', '-52vh'])

  return (
    <section className="relative isolate overflow-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,#070b11_0%,#0a1218_24%,#101f23_44%,#172a29_57%,#121a1a_71%,#070a0b_86%,#000000_100%)]"
      />
      <motion.div
        style={{ y: starsY }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.3, ease: 'easeOut', delay: 0.25 }}
        className="lp-gpu pointer-events-none absolute inset-0"
      >
        <Starfield />
      </motion.div>

      {/* ── Hero copy + CLI install (natural flow) ── */}
      <div className="relative z-30 mx-auto flex max-w-3xl flex-col items-center px-6 pt-28 text-center md:pt-32">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
          className="lp-gpu flex w-full flex-col items-center"
        >
          <h1 className="lp-hero-heading text-balance text-[34px] font-normal leading-[1.1] text-white md:text-[52px] lg:text-[58px]">
            The free coding agent for your{' '}
            <span className="text-forest-bright">terminal</span>
          </h1>

          <p className="mt-4 max-w-md text-base leading-relaxed text-white/55 md:text-[17px]">
            No subscriptions, no API keys. The best open-source models.
          </p>

          <div className="mt-9 w-full max-w-xl">
            <CliInstallCard />
          </div>
        </motion.div>
      </div>

      {/* ── Parallax scene: distant range · hills · cost chart · bushes ── */}
      <div
        ref={sceneRef}
        className="relative -mt-12 h-[108vh] w-full md:-mt-16 md:h-[118vh]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <motion.img
          src="/landing/sky-bg.webp"
          alt=""
          aria-hidden
          decoding="async"
          draggable={false}
          style={{ y: skyY }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.44 }}
          transition={{ duration: 1.3, ease: 'easeOut', delay: 0.35 }}
          className="lp-gpu pointer-events-none absolute inset-x-0 bottom-[32%] z-0 w-full select-none object-cover brightness-[0.7] saturate-[0.8]"
        />

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <motion.img
          src="/landing/hills-bg.webp"
          alt=""
          aria-hidden
          decoding="async"
          draggable={false}
          style={{ y: hillsY }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.45 }}
          className="lp-gpu pointer-events-none absolute inset-x-0 bottom-[21%] z-[1] w-full select-none object-cover brightness-[1.15] contrast-[1.05]"
        />

        <motion.div
          style={{ y: chartY }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
          className="lp-gpu absolute inset-x-0 top-[11%] z-10 mx-auto w-full max-w-4xl px-3 sm:px-6"
        >
          <CostBarChart tab="cli" />
        </motion.div>

        <motion.div
          style={{ y: bushesY }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.55 }}
          className="lp-gpu pointer-events-none absolute inset-x-0 bottom-0 z-20"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/landing/bushes-fg.webp"
            alt=""
            aria-hidden
            decoding="async"
            draggable={false}
            className="block w-full origin-bottom scale-[1.6] select-none object-cover brightness-[0.62] saturate-[0.85] md:scale-[1.3]"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-full bg-[linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,0.12)_30%,rgba(0,0,0,0.45)_50%,rgba(0,0,0,0.8)_66%,#000_78%)]" />
          <div className="absolute inset-x-0 top-[84%] h-[180vh] bg-black" />
        </motion.div>
      </div>
    </section>
  )
}

/* Compact install command with a copy button + an expandable quick-start. */
function CliInstallCard() {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)

  const copy = () => {
    navigator.clipboard?.writeText('npm install -g freebuff')
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="text-left">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 font-mono text-sm">
          <span className="select-none text-forest-bright">$</span>
          <span className="flex-1 text-white/90">npm install -g freebuff</span>
          <button
            onClick={copy}
            aria-label="Copy install command"
            className="text-white/40 transition-colors hover:text-white"
          >
            {copied ? (
              <Check className="h-4 w-4 text-forest-bright" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>

        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex shrink-0 items-center gap-1.5 text-[13px] text-white/45 transition-colors hover:text-white"
        >
          <span>Quick start</span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      </div>

      {open && (
        <div className="mt-3">
          <p className="mb-2.5 text-[12px] text-white/40">
            Type each command into your terminal, then press Enter:
          </p>
          <ol className="space-y-1">
            <GuideStep
              cmd="cd your-project"
              desc="Type this in your terminal to open your project folder"
            />
            <GuideStep
              cmd="freebuff"
              desc="Type freebuff in your terminal to launch — no API key, no credit card"
            />
            <GuideStep
              cmd="“build me a todo app”"
              copyText="build me a todo app"
              desc="Then, inside Freebuff, describe what you want — it plans, edits, and runs it"
              plain
            />
          </ol>
        </div>
      )}
    </div>
  )
}

/* One quick-start step: monospace command + description + a copy button so
 * users can paste it straight into their terminal instead of retyping. */
function GuideStep({
  cmd,
  desc,
  copyText,
  plain,
}: {
  cmd: string
  desc: string
  /** What lands on the clipboard; defaults to the displayed command. */
  copyText?: string
  plain?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard?.writeText(copyText ?? cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <li className="group -mx-2 flex items-start gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.03]">
      <div className="min-w-0 flex-1">
        <span className="block font-mono text-[13px] text-white/70">
          {!plain && <span className="select-none text-forest-bright/70">$ </span>}
          {cmd}
        </span>
        <span className="mt-0.5 block text-[12px] text-white/35">{desc}</span>
      </div>
      <button
        onClick={copy}
        aria-label={`Copy: ${copyText ?? cmd}`}
        className="mt-0.5 shrink-0 text-white/30 transition-colors hover:text-white"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-forest-bright" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </li>
  )
}
