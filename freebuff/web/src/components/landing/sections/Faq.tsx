'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How can it be free?',
    a: 'Freebuff is supported by text ads shown in the CLI.',
  },
  {
    q: 'What models do you use?',
    a: 'In full mode you can choose from DeepSeek V4 Pro, MiMo 2.5 Pro, Kimi K2.6, DeepSeek V4 Flash, MiMo 2.5, and MiniMax M3. Limited mode uses DeepSeek V4 Flash and MiMo 2.5. Connect your ChatGPT subscription to unlock GPT-5.4 for deep thinking.',
  },
  {
    q: 'Are you training on my data?',
    a: "No. We do not share your data with third parties that would train on it, unless you choose a model clearly labeled as 'Collects data for training'.",
  },
  {
    q: 'What data do you store?',
    a: "We don't store your codebase. We only collect minimal logs for debugging purposes.",
  },
  {
    q: 'What is limited mode?',
    a: 'Limited mode lets you use Freebuff outside the full-access countries, or while using a VPN. It includes DeepSeek V4 Flash and MiMo 2.5, with 5 one-hour sessions per day.',
  },
  {
    q: 'What is Freebuff Web?',
    a: 'Freebuff Web is a free AI web app builder. Describe what you want and it builds, previews, and deploys a full-stack app — no setup and no API keys.',
  },
  {
    q: 'Do I need to know how to code to use Freebuff Web?',
    a: 'No. Describe your app in plain language and refine it by chatting. You can export the underlying code at any time.',
  },
  {
    q: 'Can I deploy and host my app for free?',
    a: 'Yes. Freebuff Web gives you a live preview URL and one-click deploy at no cost.',
  },
  {
    q: 'Can I bring my own design or theme?',
    a: 'Yes. Pick from built-in styles like Minimalism, Modern, or Neobrutalism — or just describe the look you want.',
  },
]

export function Faq({ items }: { items?: { q: string; a: string }[] } = {}) {
  const faqs = items ?? FAQS
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section className="relative bg-black px-6 py-24 md:py-32">
      <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[0.8fr_1.4fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-forest-bright/90">
            FAQ
          </p>
          <h2 className="lp-feature-heading text-white">
            Questions, answered
          </h2>
        </div>

        <div className="divide-y divide-white/[0.08]">
          {faqs.map((item, i) => {
            const isOpen = open === i
            return (
              <div
                key={item.q}
                className={cn(isOpen && 'bg-forest/[0.03]')}
              >
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="group flex w-full items-center gap-4 px-2 py-5 text-left"
                >
                  <span
                    className={cn(
                      'font-mono text-xs',
                      isOpen ? 'text-forest-bright' : 'text-white/35',
                    )}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    className={cn(
                      'flex-1 font-normal transition-colors',
                      isOpen
                        ? 'text-white'
                        : 'text-white/75 group-hover:text-white',
                    )}
                  >
                    {item.q}
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-white/40 transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  />
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
                      <p className="ml-[2.1rem] mr-2 whitespace-pre-line border-l-2 border-forest/40 pb-5 pl-4 text-sm leading-relaxed text-white/60">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
