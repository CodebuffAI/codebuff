'use client'

import { motion } from 'framer-motion'
import { Check, Copy, Terminal } from 'lucide-react'
import { useState } from 'react'

import { LandingNavbar } from '../Navbar'
import { Faq } from '../sections/Faq'
import { CtaFooter } from '../sections/CtaFooter'

import { CliHero } from './CliHero'

import { cn } from '@/lib/utils'

type FaqItem = { q: string; a: string }

const INSTALL_STEPS: { command: string; label: string; desc: string }[] = [
  {
    command: 'npm install -g freebuff',
    label: 'Install the CLI',
    desc: 'Requires Node.js 18+. Works on macOS, Windows, and Linux.',
  },
  {
    command: 'cd your-project',
    label: 'Open your project',
    desc: 'Point Freebuff at any codebase — new or existing.',
  },
  {
    command: 'freebuff',
    label: 'Start coding',
    desc: 'No API key and no sign-up. Just describe what you want.',
  },
]

const HIGHLIGHTS = [
  {
    title: '100% free',
    body: 'No subscription, no credit card, no API keys. Supported by unobtrusive text ads in the CLI.',
  },
  {
    title: '9 specialized subagents',
    body: 'File finding, code review, browser testing, deep reasoning, and more — built in.',
  },
  {
    title: 'Idea → polished code',
    body: 'Use /interview → /plan → implement → /review to go from a prompt to shipped changes.',
  },
]

export function CliLanding({ faqs }: { faqs: FaqItem[] }) {
  return (
    <div className="dark relative min-h-screen bg-black font-paragraph font-light text-white">
      <LandingNavbar />
      <main>
        <CliHero />
        <div className="relative z-10 bg-black">
          <InstallSection />
          <Faq items={faqs} />
          <CtaFooter />
        </div>
      </main>
    </div>
  )
}

function InstallSection() {
  return (
    <section className="relative bg-black px-6 py-24 md:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-forest-bright/90">
            Get started
          </p>
          <h2 className="lp-feature-heading text-white">
            Up and running in under a minute
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/55">
            Install once and Freebuff lives in your terminal. No accounts to
            create, no keys to paste.
          </p>
        </div>

        <ol className="mx-auto mt-14 max-w-2xl space-y-5">
          {INSTALL_STEPS.map((step, i) => (
            <motion.li
              key={step.command}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="flex gap-4"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-forest/30 bg-forest/10 font-mono text-xs text-forest-bright">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-normal text-white/90">{step.label}</p>
                <p className="mt-0.5 text-sm text-white/45">{step.desc}</p>
                <CommandLine command={step.command} />
              </div>
            </motion.li>
          ))}
        </ol>

        <div className="mt-16 grid gap-5 sm:grid-cols-3">
          {HIGHLIGHTS.map((h) => (
            <div
              key={h.title}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5"
            >
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-forest/10 text-forest-bright">
                <Terminal className="h-4 w-4" />
              </div>
              <h3 className="font-normal text-white/90">{h.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/50">
                {h.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CommandLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard?.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="mt-2.5 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 font-mono text-sm">
      <span className="select-none text-forest-bright">$</span>
      <code className="flex-1 select-all text-white/90">{command}</code>
      <button
        onClick={copy}
        aria-label={`Copy: ${command}`}
        className="text-white/40 transition-colors hover:text-white"
      >
        {copied ? (
          <Check className={cn('h-4 w-4 text-forest-bright')} />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    </div>
  )
}
