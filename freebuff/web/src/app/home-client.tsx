'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  Terminal,
  Brain,
  Scissors,
  Zap,
  MessageSquare,
  FileText,
  ChevronDown,
} from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'

import { BackgroundBeams } from '@/components/background-beams'
import { CopyButton } from '@/components/copy-button'
import { HeroGrid } from '@/components/hero-grid'
import { TerminalDemo } from '@/components/terminal-demo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const INSTALL_COMMAND = 'npm install -g freebuff'

const features = [
  {
    icon: Brain,
    title: 'Deep Codebase Understanding',
    description:
      'Indexes your entire project to generate code that fits your patterns and conventions.',
  },
  {
    icon: Scissors,
    title: 'Surgical Code Edits',
    description:
      "Makes precise changes across files while respecting your codebase's structure.",
  },
  {
    icon: Terminal,
    title: 'Terminal Integration',
    description:
      'Runs commands on your behalf — install packages, run tests, and more.',
  },
  {
    icon: FileText,
    title: 'Knowledge Files',
    description:
      'Add knowledge.md to teach Freebuff about your project conventions.',
  },
  {
    icon: MessageSquare,
    title: 'Chat History',
    description:
      'Resume past conversations and pick up right where you left off.',
  },
  {
    icon: Zap,
    title: 'Custom Agents',
    description:
      'Load custom agents from your .agents/ directory for specialized workflows.',
  },
]

const headlineWords = ["The", "strongest"]
const greenWords = ["free", "coding", "agent."]

const faqs = [
  {
    question: 'Is it really free?',
    answer:
      'Yes! Freebuff is completely free to use. The service is supported by ads shown in the CLI.',
  },
  {
    question: 'Are you training on my data?',
    answer:
      'No. We only use model providers that do not train on our requests. Your code stays yours.',
  },
  {
    question: 'What data do you store?',
    answer:
      "We don't store your codebase. We only collect minimal logs for debugging purposes.",
  },
  {
    question: 'What model do you use?',
    answer:
      'We use multiple models: MiniMax M2.5 as the main coding agent, Gemini 3.1 Flash Lite for finding files, and GPT-5.4 for deep thinking if you connect your ChatGPT subscription.',
  },
]

function InstallCommand({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-4 py-3 font-mono text-sm',
        'hover:border-acid-green/50 hover:shadow-[0_0_20px_rgba(0,255,149,0.12)] transition-all duration-300',
        'gradient-border-shine',
        className,
      )}
    >
      <span className="text-acid-green select-none">$</span>
      <code className="text-white/90 select-all flex-1">
        {INSTALL_COMMAND}
      </code>
      <CopyButton value={INSTALL_COMMAND} />
    </div>
  )
}

function FAQList() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="space-y-3">
      {faqs.map((faq, i) => {
        const isOpen = openIndex === i
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
          >
            <button
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="w-full flex items-center justify-between gap-4 bg-zinc-900/50 border border-zinc-800 rounded-xl px-6 py-4 text-left hover:border-acid-green/30 hover:bg-zinc-900/80 transition-all duration-300 cursor-pointer"
            >
              <span className="font-semibold text-white">{faq.question}</span>
              <motion.span
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: 0.25 }}
                className="flex-shrink-0 text-zinc-400"
              >
                <ChevronDown className="h-5 w-5" />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <p className="px-6 pt-3 pb-1 text-zinc-400 leading-relaxed">
                    {faq.answer}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )
      })}
    </div>
  )
}

const wordVariant = {
  initial: { opacity: 0, y: 30, filter: 'blur(8px)' },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.6,
      ease: [0.165, 0.84, 0.44, 1],
    },
  },
}

export default function HomeClient() {
  return (
    <div className="relative">
      {/* ─── Hero Section ─── */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center overflow-hidden">
        {/* Layered backgrounds */}
        <div className="absolute inset-0 bg-gradient-to-b from-dark-forest-green via-black to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(0,255,149,0.12),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_80%_at_50%_100%,rgba(0,255,149,0.04),transparent_60%)]" />

        <HeroGrid />
        <BackgroundBeams />

        {/* Hero content */}
        <div className="relative z-10 container mx-auto px-4 pt-20 pb-12 text-center">
          {/* Pill badge */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-10"
          >
            <div className="inline-flex items-center gap-2 bg-acid-green/[0.08] border border-acid-green/20 rounded-full px-5 py-2 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-acid-green opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-acid-green" />
              </span>
              <span className="text-acid-green text-sm font-semibold tracking-wide">
                100% Free
              </span>
            </div>
          </motion.div>

          {/* Headline with staggered word animation */}
          <motion.h1
            className="hero-heading mb-8"
            variants={{
              animate: {
                transition: { staggerChildren: 0.08, delayChildren: 0.3 },
              },
            }}
            initial="initial"
            animate="animate"
          >
            <span className="block text-white mb-2">
              {headlineWords.map((word, i) => (
                <motion.span
                  key={i}
                  variants={wordVariant}
                  className="inline-block mr-[0.3em]"
                >
                  {word}
                </motion.span>
              ))}
            </span>
            <span className="block">
              {greenWords.map((word, i) => (
                <motion.span
                  key={i}
                  variants={wordVariant}
                  className="inline-block mr-[0.3em] text-acid-green neon-text animate-glow-pulse"
                >
                  {word}
                </motion.span>
              ))}
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
             No subscription. No API key. 5x faster than Claude Code.
          </motion.p>

          {/* Install command */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1.0 }}
            className="max-w-md mx-auto mb-8"
          >
            <InstallCommand />
          </motion.div>

          {/* Terminal demo */}
          <TerminalDemo />
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent" />
      </section>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-acid-green/30 to-transparent" />

      {/* ─── Features Section ─── */}
      <section className="py-24 px-4">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything you need. Nothing you don&apos;t.
            </h2>
            <p className="text-zinc-400 text-lg max-w-xl mx-auto">
              Freebuff brings the full power of an AI coding agent to your
              terminal — completely free.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="group bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-acid-green/30 hover:bg-zinc-900/80 transition-all duration-300"
              >
                <div className="h-10 w-10 rounded-lg bg-acid-green/10 border border-acid-green/20 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-acid-green/15 transition-all duration-300">
                  <feature.icon className="h-5 w-5 text-acid-green" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ Section ─── */}
      <section className="py-24 px-4">
        <div className="container mx-auto max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Frequently asked questions
            </h2>
          </motion.div>

          <FAQList />
        </div>
      </section>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

      {/* ─── CTA Section ─── */}
      <section className="relative py-24 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,255,149,0.04),transparent_70%)]" />
        <div className="container mx-auto max-w-2xl text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Start coding for free
            </h2>
            <p className="text-zinc-400 text-lg mb-8">
              No credit card. No trial period. Just install and go.
            </p>

            <InstallCommand className="max-w-md mx-auto mb-8" />

            <p className="text-xs text-zinc-500">
              Want more power?{' '}
              <Link
                href="https://codebuff.com/pricing"
                className="text-acid-green hover:underline"
              >
                Check out Codebuff
              </Link>{' '}
              for premium models and higher limits.
            </p>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
