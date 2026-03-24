'use client'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Rocket,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import posthog from 'posthog-js'
import { useEffect, useState } from 'react'

import { BackgroundBeams } from '@/components/background-beams'
import { CopyButton } from '@/components/copy-button'
import { HeroGrid } from '@/components/hero-grid'
import { Icons } from '@/components/icons'
import { cn } from '@/lib/utils'

const INSTALL_COMMAND = 'npm install -g freebuff'

const editors = [
  { name: 'VS Code', icon: '/logos/visual-studio.png' },
  { name: 'Cursor', icon: '/logos/cursor.png' },
  {
    name: 'IntelliJ',
    icon: '/logos/intellij.png',
    needsWhiteBg: true,
  },
  {
    name: "Good ol' Terminal",
    icon: '/logos/terminal.svg',
  },
]

type OS = 'windows' | 'macos' | 'linux'

const detectOS = (): OS => {
  if (typeof window !== 'undefined') {
    const userAgent = window.navigator.userAgent.toLowerCase()
    if (userAgent.includes('mac')) return 'macos'
    if (userAgent.includes('win')) return 'windows'
  }
  return 'linux'
}

function StepBadge({ number }: { number: number }) {
  return (
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-acid-matrix flex items-center justify-center text-black font-bold text-sm">
      {number}
    </div>
  )
}

function StepContainer({
  children,
  isLast = false,
}: {
  children: React.ReactNode
  isLast?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="relative"
    >
      {!isLast && (
        <div className="absolute left-[15px] top-12 bottom-0 w-[2px] bg-gradient-to-b from-acid-matrix/50 to-acid-matrix/10" />
      )}
      {children}
    </motion.div>
  )
}

function CommandBlock({ command }: { command: string }) {
  return (
    <div className="bg-zinc-800/60 border border-zinc-700/40 rounded-md px-3 py-2.5 flex items-center justify-between hover:border-acid-matrix/30 transition-colors duration-200">
      <code className="font-mono text-white/90 select-all text-sm">
        {command}
      </code>
      <CopyButton value={command} />
    </div>
  )
}

interface GetStartedClientProps {
  referrerName: string | null
}

export default function GetStartedClient({
  referrerName,
}: GetStartedClientProps) {
  const [os, setOs] = useState<OS>('linux')
  const [helpExpanded, setHelpExpanded] = useState(false)

  useEffect(() => {
    setOs(detectOS())
    posthog.capture(AnalyticsEvent.FREEBUFF_GET_STARTED_VIEWED, {
      referrer: referrerName,
    })
    if (referrerName) {
      localStorage.setItem('freebuff_referrer', referrerName)
    }
  }, [referrerName])

  return (
    <div className="relative min-h-screen">
      {/* Background layers */}
      <div className="absolute inset-0 bg-gradient-to-b from-dark-forest-green via-black/95 to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(124,255,63,0.12),transparent_50%)]" />
      <HeroGrid />
      <BackgroundBeams />

      {/* Nav */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="absolute top-0 left-0 right-0 z-20 container mx-auto px-4 py-4 flex justify-between items-center"
      >
        <Link
          href="/"
          className="flex items-center space-x-2 group transition-all duration-300 hover:translate-x-0.5"
        >
          <Image
            src="/logo-icon.png"
            alt="Freebuff"
            width={28}
            height={28}
            className="rounded-sm opacity-60 group-hover:opacity-100 transition-all duration-300 group-hover:brightness-110"
          />
          <span className="text-xl tracking-widest font-serif text-zinc-400 group-hover:text-white transition-colors duration-200">
            freebuff
          </span>
        </Link>

        <nav className="flex items-center space-x-1">
          <Link
            href="https://github.com/CodebuffAI/codebuff"
            target="_blank"
            rel="noopener noreferrer"
            className="relative font-medium px-3 py-2 rounded-md transition-all duration-200 text-zinc-400 hover:text-white flex items-center gap-2 text-sm"
          >
            <Icons.github className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span>
          </Link>
        </nav>
      </motion.div>

      {/* Main content */}
      <div className="relative z-10 container mx-auto px-4 pt-16 pb-16 md:pt-36 md:pb-24 flex flex-col items-center">
        <div className="w-full max-w-2xl">
          <div className="bg-background/80 backdrop-blur-sm border border-zinc-800 rounded-xl overflow-hidden">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="p-8 pb-6 border-b border-zinc-800"
            >
              <h1 className="text-2xl md:text-3xl font-bold mb-2 font-serif">
                {referrerName
                  ? `${referrerName} invited you to try Freebuff!`
                  : 'Welcome to Freebuff! 🎉'}
              </h1>
              <p className="text-muted-foreground">
                {referrerName
                  ? 'Get set up in under a minute — it\'s completely free.'
                  : 'The free coding agent. Get set up in under a minute.'}
              </p>
            </motion.div>

            {/* Steps */}
            <div className="p-8 space-y-6">
              {/* Step 1: Install */}
              <StepContainer>
                <div className="flex items-start gap-4">
                  <StepBadge number={1} />
                  <div className="flex-1 space-y-4">
                    <h3 className="text-lg font-semibold">Install Freebuff</h3>
                    <CommandBlock command={INSTALL_COMMAND} />

                    {/* Collapsible help */}
                    <div className="rounded-lg overflow-hidden">
                      <button
                        onClick={() => {
                          if (!helpExpanded) {
                            posthog.capture(
                              AnalyticsEvent.FREEBUFF_GET_STARTED_HELP_EXPANDED,
                            )
                          }
                          setHelpExpanded(!helpExpanded)
                        }}
                        className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-zinc-800/50 transition-colors cursor-pointer"
                      >
                        <span>Need help setting up?</span>
                        {helpExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      <AnimatePresence>
                        {helpExpanded && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="px-4 pb-4 border-t border-zinc-700"
                          >
                            <div className="space-y-4 mt-4">
                              <div>
                                <p className="text-sm font-medium mb-2">
                                  Open your IDE or Terminal
                                </p>
                                <p className="text-sm text-muted-foreground mb-3">
                                  Choose your preferred development
                                  environment:
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                  {editors.map((editor) => (
                                    <button
                                      key={editor.name}
                                      type="button"
                                      className="flex items-center gap-2 px-3 py-2 bg-zinc-800/60 border border-zinc-700/40 rounded-lg hover:border-zinc-600 transition-colors duration-200 cursor-pointer"
                                      onClick={() =>
                                        posthog.capture(
                                          AnalyticsEvent.FREEBUFF_GET_STARTED_EDITOR_CLICKED,
                                          { editor: editor.name },
                                        )
                                      }
                                    >
                                      <div
                                        className={cn(
                                          'w-5 h-5 relative flex-shrink-0',
                                          editor.needsWhiteBg &&
                                            'bg-white rounded-sm p-[1px]',
                                        )}
                                      >
                                        <Image
                                          src={editor.icon}
                                          alt={editor.name}
                                          fill
                                          className="object-contain"
                                        />
                                      </div>
                                      <span className="text-sm font-medium text-zinc-200">
                                        {editor.name}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="border-t border-zinc-700 pt-4">
                                <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
                                  <p className="text-zinc-300 text-sm">
                                    <strong>
                                      Check your Node.js installation:
                                    </strong>{' '}
                                    Open your terminal and run:
                                  </p>
                                  <div className="mt-2 text-xs font-mono">
                                    <code className="bg-zinc-700 px-2 py-1 rounded">
                                      node --version
                                    </code>
                                  </div>
                                </div>
                              </div>

                              {os === 'windows' && (
                                <div className="bg-yellow-950/50 border border-yellow-800 rounded-lg p-4">
                                  <p className="text-yellow-200 text-sm">
                                    <strong>Windows users:</strong> You may need
                                    to run your terminal as Administrator for
                                    global npm installs.
                                  </p>
                                </div>
                              )}

                              <div className="space-y-2">
                                <p className="text-sm font-medium">
                                  Need Node.js?
                                </p>
                                <a
                                  href="https://nodejs.org/en/download"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-sm text-acid-matrix hover:underline"
                                >
                                  Download Node.js{' '}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </StepContainer>

              {/* Step 2: Navigate to project */}
              <StepContainer>
                <div className="flex items-start gap-4">
                  <StepBadge number={2} />
                  <div className="flex-1 space-y-4">
                    <h3 className="text-lg font-semibold">
                      Navigate to your project
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      Open any terminal and <code className="font-mono">cd</code>{' '}
                      into the project you want to work on.
                    </p>
                    <CommandBlock
                      command={
                        os === 'windows'
                          ? 'cd C:\\Users\\YourName\\my-project'
                          : 'cd ~/my-project'
                      }
                    />
                  </div>
                </div>
              </StepContainer>

              {/* Step 3: Run Freebuff */}
              <StepContainer isLast>
                <div className="flex items-start gap-4">
                  <StepBadge number={3} />
                  <div className="flex-1 space-y-4">
                    <h3 className="text-lg font-semibold">Run Freebuff</h3>
                    <p className="text-muted-foreground text-sm">
                      That&apos;s it — start chatting with the AI to build
                      faster.
                    </p>
                    <CommandBlock command="freebuff" />
                  </div>
                </div>
              </StepContainer>
            </div>

            {/* Footer */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="p-8 pt-4 border-t border-zinc-800 bg-gradient-to-b from-transparent to-acid-matrix/5"
            >
              <div className="flex items-center justify-center gap-3 text-center">
                <Rocket className="w-5 h-5 text-acid-matrix" />
                <p className="text-muted-foreground">
                  No subscription needed. No configuration. Just works.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
