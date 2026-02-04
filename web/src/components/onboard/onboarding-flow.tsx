'use client'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ExternalLink,
  Terminal,
  ChevronDown,
  ChevronUp,
  Rocket,
} from 'lucide-react'
import Image from 'next/image'
import posthog from 'posthog-js'
import { useState, useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EnhancedCopyButton } from '@/components/ui/enhanced-copy-button'
import { cn } from '@/lib/utils'

interface OnboardingFlowProps {
  referralCode?: string
  referrerName?: string
}

type OS = 'windows' | 'macos' | 'linux'

interface OnboardingState {
  os: OS
}

interface TerminalDialogState {
  isOpen: boolean
  instructions: string
  osDisplayName: string
}

const editors = [
  { name: 'VS Code', href: 'vscode://~/', icon: '/logos/visual-studio.png' },
  { name: 'Cursor', href: 'cursor://~/', icon: '/logos/cursor.png' },
  {
    name: 'IntelliJ',
    href: 'idea://~/',
    icon: '/logos/intellij.png',
    needsWhiteBg: true,
  },
  {
    name: "Good ol' Terminal",
    href: 'terminal://',
    icon: '/logos/terminal.svg',
    needsWhiteBg: false,
  },
]

const INSTALL_COMMAND = 'npm install -g codebuff'

const detectOS = (): OS => {
  if (typeof window !== 'undefined') {
    const userAgent = window.navigator.userAgent.toLowerCase()
    if (userAgent.includes('mac')) return 'macos'
    if (userAgent.includes('win')) return 'windows'
  }
  return 'linux'
}

const StepBadge = ({ number }: { number: number }) => (
  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-acid-matrix flex items-center justify-center text-black font-bold text-sm">
    {number}
  </div>
)

const StepContainer = ({
  children,
  isLast = false,
}: {
  children: React.ReactNode
  isLast?: boolean
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-50px' }}
    transition={{ duration: 0.4, ease: 'easeOut' }}
    className="relative"
  >
    {/* Timeline connector line */}
    {!isLast && (
      <div className="absolute left-[15px] top-12 bottom-0 w-[2px] bg-gradient-to-b from-acid-matrix/50 to-acid-matrix/10" />
    )}
    {children}
  </motion.div>
)

export function OnboardingFlow({
  referralCode,
  referrerName,
}: OnboardingFlowProps) {
  const [terminalDialog, setTerminalDialog] = useState<TerminalDialogState>({
    isOpen: false,
    instructions: '',
    osDisplayName: 'Linux',
  })
  const [helpExpanded, setHelpExpanded] = useState(false)
  const [state, setState] = useState<OnboardingState>({
    os: 'linux' as OS,
  })
  const referralStepRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setState({ os: detectOS() })
  }, [])

  const scrollToReferralStep = () => {
    referralStepRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const getCdExamples = () => {
    if (state.os === 'windows') {
      return [
        'cd C:\\Users\\YourName\\my-project',
        'cd D:\\Projects\\my-react-app',
      ]
    }
    return ['cd ~/my-project', 'cd ~/Documents/my-react-app']
  }

  const renderPrerequisitesContent = () => (
    <div className="space-y-4 mt-4">
      <div>
        <p className="text-sm font-medium mb-2">Open your IDE or Terminal</p>
        <p className="text-sm text-muted-foreground mb-3">
          Choose your preferred development environment:
        </p>
        <div className="grid grid-cols-2 gap-2">
          {editors.map((editor) => (
            <button
              key={editor.name}
              className="relative w-full bg-zinc-800/60 hover:bg-zinc-800/80 rounded-lg border border-zinc-600/70 hover:border-white/40 flex flex-row items-center justify-between group transition-all duration-200 py-2 px-3"
              onClick={() => {
                if (editor.name === "Good ol' Terminal") {
                  const os = detectOS()
                  let instructions = ''
                  let osDisplayName = ''

                  if (os === 'macos') {
                    instructions =
                      'Press Cmd+Space, type "Terminal", and press Enter'
                    osDisplayName = 'macOS'
                  } else if (os === 'windows') {
                    instructions =
                      'Press Win+R, type "cmd" or "wt", and press Enter'
                    osDisplayName = 'Windows'
                  } else {
                    instructions =
                      'Press Ctrl+Alt+T or search for "Terminal" in your applications'
                    osDisplayName = 'Linux'
                  }

                  setTerminalDialog({
                    isOpen: true,
                    instructions,
                    osDisplayName,
                  })
                } else {
                  window.open(editor.href, '_blank', 'noopener,noreferrer')
                }
                posthog.capture(AnalyticsEvent.ONBOARDING_EDITOR_OPENED, {
                  editor: editor.name,
                })
              }}
              aria-label={`Open in ${editor.name}`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-5 h-5 relative flex-shrink-0',
                    editor.needsWhiteBg && 'bg-white rounded-sm p-[1px]',
                  )}
                >
                  <Image
                    src={editor.icon}
                    alt={editor.name}
                    fill
                    className="object-contain"
                  />
                </div>
                <span className="text-white/90 font-medium text-sm">
                  {editor.name}
                </span>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-zinc-700 pt-4">
        <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <p className="text-blue-800 dark:text-blue-200 text-sm">
            <strong>Check your Node.js installation:</strong> Open your terminal
            and run:
          </p>
          <div className="mt-2 text-xs font-mono">
            <code className="bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">
              node --version
            </code>
          </div>
        </div>
      </div>

      {state.os === 'windows' && (
        <div className="bg-yellow-50 dark:bg-yellow-950/50 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-yellow-800 dark:text-yellow-200 text-sm">
            <strong>Windows users:</strong> You may need to run your terminal as
            Administrator for global npm installs.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Need Node.js?</p>
        <p className="text-sm text-muted-foreground">
          Download and install Node.js to get started:
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a
              href="https://nodejs.org/en/download"
              target="_blank"
              rel="noopener noreferrer"
            >
              Download Node.js <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  )

  const getTotalSteps = () => (referralCode ? 4 : 3)

  return (
    <>
      {/* Terminal Instructions Dialog */}
      <Dialog
        open={terminalDialog.isOpen}
        onOpenChange={(open) =>
          setTerminalDialog((prev) => ({ ...prev, isOpen: open }))
        }
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              How to Open Your Terminal
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 border rounded-lg p-4">
              <p className="font-medium text-sm mb-2">
                On {terminalDialog.osDisplayName}:
              </p>
              <p className="text-sm">{terminalDialog.instructions}</p>
            </div>
            {terminalDialog.osDisplayName === 'Windows' && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-blue-800 dark:text-blue-200 text-sm">
                  <strong>Tip:</strong> Try "wt" for Windows Terminal or "cmd"
                  for Command Prompt
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                setTerminalDialog((prev) => ({ ...prev, isOpen: false }))
              }
            >
              Got it!
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="bg-background border rounded-xl max-w-4xl mx-auto overflow-hidden">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="p-8 pb-6 border-b border-zinc-800"
        >
          <h2 className="text-2xl font-bold mb-2">
            {referrerName
              ? `Claim your bonus credits from ${referrerName} 🎁`
              : 'Welcome to Codebuff! 🎉'}
          </h2>

          {/* What is Codebuff blurb */}
          <p className="text-muted-foreground">
            Get free bonus credits for Codebuff, a powerful AI coding agent. It takes only seconds!
          </p>
        </motion.div>

        {/* Steps */}
        <div className="p-8 space-y-6">
          {/* Step 1: Install */}
          <StepContainer>
            <div className="flex items-start gap-4">
              <StepBadge number={1} />
              <div className="flex-1 space-y-4">
                <h3 className="text-lg font-semibold">Install the Codebuff CLI</h3>
                <div className="bg-zinc-800/60 rounded-md px-3 py-2.5 flex items-center justify-between">
                  <code className="font-mono text-white/90 select-all text-sm">
                    {INSTALL_COMMAND}
                  </code>
                  <EnhancedCopyButton value={INSTALL_COMMAND} />
                </div>

                {/* Collapsible help section */}
                <div className="rounded-lg overflow-hidden">
                  <button
                    onClick={() => setHelpExpanded(!helpExpanded)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-zinc-800/50 transition-colors"
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
                        {renderPrerequisitesContent()}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </StepContainer>

          {/* Step 2: Navigate and Run */}
          <StepContainer isLast={!referralCode}>
            <div className="flex items-start gap-4">
              <StepBadge number={2} />
              <div className="flex-1 space-y-4">
                <h3 className="text-lg font-semibold">Navigate to your project and run Codebuff</h3>
                <p className="text-muted-foreground text-sm">
                  In your terminal, navigate to any project folder, and run Codebuff.
                </p>
                <div className="space-y-2">
                  <div className="bg-zinc-800/60 rounded-md px-3 py-2.5 flex items-center justify-between">
                    <code className="font-mono text-white/90 select-all text-sm">
                      cd /path/to/your-project
                    </code>
                    <EnhancedCopyButton value="cd /path/to/your-project" />
                  </div>
                  <div className="bg-zinc-800/60 rounded-md px-3 py-2.5 flex items-center justify-between">
                    <code className="font-mono text-white/90 select-all text-sm">
                      codebuff
                    </code>
                    <EnhancedCopyButton value="codebuff" />
                  </div>
                </div>
              </div>
            </div>
          </StepContainer>

          {/* Step 3: Redeem Referral (if applicable) */}
          {referralCode && (
            <StepContainer isLast>
              <div ref={referralStepRef} className="flex items-start gap-4">
                <StepBadge number={3} />
                <div className="flex-1 space-y-4">
                  <h3 className="text-lg font-semibold">
                    Redeem Your Referral Code 🎉
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    You're almost done! Paste your code into the CLI to claim bonus credits
                    {referrerName ? ` — ${referrerName} will earn credits too!` : '.'}
                  </p>
                  <div className="bg-acid-matrix/20 rounded-lg p-6">
                    <p className="text-green-200 text-lg font-semibold mb-3">
                      🎁{' '}
                      {referrerName
                        ? `You and ${referrerName} will both`
                        : "You'll"}{' '}
                      earn bonus credits!
                    </p>
                    <div className="bg-zinc-800 rounded-md p-3 flex items-center justify-between">
                      <code
                        className="font-mono text-white font-bold text-lg"
                        suppressHydrationWarning
                      >
                        {referralCode}
                      </code>
                      <EnhancedCopyButton value={referralCode} />
                    </div>
                    <p className="text-green-200/80 text-sm mt-2">
                      Paste this code in the CLI input box after logging in to claim your
                      bonus credits!
                    </p>
                  </div>
                </div>
              </div>
            </StepContainer>
          )}
        </div>

        {/* Success/Celebration Footer */}
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
              You're all set! Start chatting with Codebuff to build faster.
            </p>
          </div>
        </motion.div>
      </div>
    </>
  )
}
