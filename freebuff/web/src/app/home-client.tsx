'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
} from 'lucide-react'
import { useState } from 'react'

import { BackgroundBeams } from '@/components/background-beams'
import { CopyButton } from '@/components/copy-button'
import { HeroGrid } from '@/components/hero-grid'
import { cn } from '@/lib/utils'

const INSTALL_COMMAND = 'npm install -g freebuff'

const headlineWords = ["The", "free", "coding", "agent"]

const faqs = [
  {
    question: 'How can it be free?',
    answer:
      'Freebuff is supported by ads shown in the CLI.',
  },
  {
    question: 'What models do you use?',
    answer:
      'MiniMax M2.5 as the main coding agent, Gemini 3.1 Flash Lite for finding files and research, and GPT-5.4 for deep thinking if you connect your ChatGPT subscription.',
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
]

const setupSteps = [
  {
    label: 'Open your terminal',
    description: 'Use any terminal — within VS Code, plain terminal, PowerShell, etc.',
  },
  {
    label: 'Navigate to your project',
    command: 'cd /path/to/your-repo',
  },
  {
    label: 'Install Freebuff',
    command: 'npm install -g freebuff',
  },
  {
    label: 'Run Freebuff',
    command: 'freebuff',
  },
]

function SetupGuide() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="max-w-md mx-auto">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex items-center gap-2 mx-auto text-sm text-zinc-400 hover:text-acid-green transition-colors duration-200 cursor-pointer group"
      >
        <span>Install guide</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.25 }}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-4 bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 text-left">
              <ol className="space-y-4">
                {setupSteps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-acid-green/10 border border-acid-green/30 flex items-center justify-center text-xs font-mono text-acid-green">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white/90">{step.label}</p>
                      {'description' in step && step.description && (
                        <p className="text-xs text-zinc-500 mt-0.5">{step.description}</p>
                      )}
                      {'command' in step && step.command && (
                        <div className="mt-1.5 flex items-center gap-2 bg-zinc-800/60 border border-zinc-700/40 rounded-md px-3 py-1.5 hover:border-acid-green/30 transition-colors duration-200">
                          <code className="font-mono text-xs text-white/80 flex-1 select-all">
                            {step.command}
                          </code>
                          <CopyButton value={step.command} />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

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

const PHILOSOPHY_WORDS = [
  { word: 'FAST', description: '3× the speed of Claude Code' },
  { word: 'SIMPLE', description: 'No modes. No config. Just code.' },
  { word: 'LOADED', description: 'Web research, browser use, and more — built in' },
]

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
            <span className="block">
              {headlineWords.map((word, i) => (
                <motion.span
                  key={i}
                  variants={wordVariant}
                  className={word === 'free' ? 'inline-block mr-[0.3em] text-acid-green neon-text animate-glow-pulse' : 'inline-block mr-[0.3em] text-white'}
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
            No subscription. No configuration. Start in seconds.
          </motion.p>

          {/* Install command */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1.0 }}
            className="max-w-md mx-auto mb-4"
          >
            <InstallCommand />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.3 }}
            className="mb-8"
          >
            <SetupGuide />
          </motion.div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent" />
      </section>

      {/* ─── Philosophy Section ─── */}
      <section className="relative py-24 md:py-32 px-4 overflow-hidden">
        <div className="relative z-10 container mx-auto max-w-5xl">
          <div className="flex flex-col gap-12 md:gap-16">
            {PHILOSOPHY_WORDS.map((item, i) => (
              <motion.div
                key={item.word}
                initial={{ opacity: 0, filter: 'blur(12px)' }}
                whileInView={{ opacity: 1, filter: 'blur(0px)' }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.7, delay: i * 0.1 }}
                className="group"
              >
                <div className="keyword-hollow font-dm-mono text-7xl md:text-[8rem] lg:text-[10rem] font-medium leading-[0.85] tracking-tighter select-none">
                  {item.word}
                </div>
                <p className="mt-3 md:mt-4 text-zinc-500 text-sm md:text-base font-mono tracking-wide">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-acid-green/30 to-transparent" />

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
    </div>
  )
}
