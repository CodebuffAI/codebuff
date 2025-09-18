'use client'

import { useState, useEffect } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Check,
  ExternalLink,
  Terminal,
} from 'lucide-react'
import Image from 'next/image'
import posthog from 'posthog-js'

import { Button } from '@/components/ui/button'
import { EnhancedCopyButton } from '@/components/ui/enhanced-copy-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

interface OnboardingFlowProps {
  hasReferralCode: boolean
  onComplete?: () => void
}

type OS = 'windows' | 'macos' | 'linux'
type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun'

interface StepProgress {
  currentStep: number
  completedSteps: Set<number>
  os: OS
  packageManager: PackageManager
  hasDevSetup: boolean
}

interface TerminalDialogState {
  isOpen: boolean
  instructions: string
  osDisplayName: string
}

const TOTAL_STEPS = 7
const TOTAL_STEPS_DEV = 3

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

const getInstallCommand = (pm: PackageManager): string => {
  switch (pm) {
    case 'yarn':
      return 'yarn global add codebuff'
    case 'pnpm':
      return 'pnpm add -g codebuff'
    case 'bun':
      return 'bun add -g codebuff'
    default:
      return 'npm install -g codebuff'
  }
}

const detectOS = (): OS => {
  if (typeof window !== 'undefined') {
    const userAgent = window.navigator.userAgent.toLowerCase()
    if (userAgent.includes('mac')) return 'macos'
    if (userAgent.includes('win')) return 'windows'
  }
  return 'linux'
}

export function OnboardingFlow({
  hasReferralCode,
  onComplete,
}: OnboardingFlowProps) {
  const [mounted, setMounted] = useState(false)
  const isMobile = useIsMobile()
  const [terminalDialog, setTerminalDialog] = useState<TerminalDialogState>({
    isOpen: false,
    instructions: '',
    osDisplayName: 'Linux',
  })

  const [progress, setProgress] = useState<StepProgress>({
    currentStep: 0,
    completedSteps: new Set<number>(),
    os: 'linux' as OS,
    packageManager: 'npm' as PackageManager,
    hasDevSetup: false,
  })

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('codebuff_onboarding_progress')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setProgress({
          ...parsed,
          completedSteps: new Set(parsed.completedSteps || []),
          os: detectOS(), // Update OS detection after mount
        })
      } catch {}
    } else {
      // Update OS detection after mount even if no saved progress
      setProgress((prev) => ({ ...prev, os: detectOS() }))
    }
  }, [])

  // Save progress to localStorage (only after mounted)
  useEffect(() => {
    if (mounted) {
      const toSave = {
        ...progress,
        completedSteps: Array.from(progress.completedSteps),
      }
      localStorage.setItem(
        'codebuff_onboarding_progress',
        JSON.stringify(toSave)
      )
    }
  }, [progress, mounted])

  const markStepComplete = (step: number) => {
    setProgress((prev) => ({
      ...prev,
      completedSteps: new Set([...prev.completedSteps, step]),
    }))
    posthog.capture('onboarding_step_completed', { step })
  }

  const getTotalSteps = () =>
    progress.hasDevSetup ? TOTAL_STEPS_DEV : TOTAL_STEPS

  const nextStep = () => {
    const totalSteps = getTotalSteps()
    if (progress.currentStep < totalSteps - 1) {
      setProgress((prev) => ({ ...prev, currentStep: prev.currentStep + 1 }))
      posthog.capture('onboarding_step_viewed', {
        step: progress.currentStep + 1,
        hasDevSetup: progress.hasDevSetup,
      })
    } else if (onComplete) {
      onComplete()
    }
  }

  const prevStep = () => {
    if (progress.currentStep > 0) {
      setProgress((prev) => ({ ...prev, currentStep: prev.currentStep - 1 }))
    }
  }

  const handlePMChange = (pm: PackageManager) => {
    setProgress((prev) => ({ ...prev, packageManager: pm }))
    posthog.capture('onboarding_pm_selected', { packageManager: pm })
  }

  const renderRunCodebuffStep = () => (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Run Codebuff</h3>
      <p className="text-muted-foreground">
        {progress.hasDevSetup
          ? 'Run the Codebuff command in your project directory to start the AI assistant.'
          : 'Now run the Codebuff command to start it in your terminal. It will also open a browser window for authentication.'}
      </p>
      <div className="bg-zinc-800/60 border border-zinc-700/50 hover:border-[#00FF9580] hover:shadow-[0_0_15px_#00FF9540] rounded-md overflow-hidden relative px-3 py-2.5 flex items-center justify-between transition-all duration-300 cursor-pointer group">
        <code className="font-mono text-white/90 select-all text-sm">
          codebuff
        </code>
        <EnhancedCopyButton value="codebuff" />
      </div>
    </div>
  )

  const renderConnectAccountStep = () => (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Connect Your Account</h3>
      <p className="text-muted-foreground">
        Codebuff will open your browser to connect your CLI to your account.
      </p>
      {hasReferralCode && (
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-6">
          <p className="text-green-800 dark:text-green-200 text-lg font-semibold mb-3">
            🎁 Referral Code
          </p>
          <p className="text-green-800 dark:text-green-200 text-sm my-2">
            After logging in, paste this code in the CLI to claim your bonus
            credits!
          </p>
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md p-3 flex items-center justify-between">
            {' '}
            <code
              className="font-mono text-gray-900 dark:text-gray-100 font-bold text-lg"
              suppressHydrationWarning
            >
              {mounted && typeof window !== 'undefined'
                ? new URLSearchParams(window.location.search).get(
                    'referral_code'
                  ) || 'REFERRAL_CODE'
                : 'REFERRAL_CODE'}
            </code>
            <EnhancedCopyButton
              value={
                mounted && typeof window !== 'undefined'
                  ? new URLSearchParams(window.location.search).get(
                      'referral_code'
                    ) || 'REFERRAL_CODE'
                  : 'REFERRAL_CODE'
              }
            />
          </div>
        </div>
      )}
    </div>
  )

  const renderFinishStep = () => (
    <div className="space-y-4 text-center">
      <h3 className="text-xl font-semibold">🎉 You're All Set!</h3>
      <p className="text-muted-foreground">
        Codebuff is now connected to your account. You can close this window.
      </p>
      {hasReferralCode && (
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-6">
          <p className="text-green-800 dark:text-green-200 text-lg font-semibold mb-3">
            🎁 Referral Code
          </p>
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md p-3 flex items-center justify-between">
            <code
              className="font-mono text-gray-900 dark:text-gray-100 font-bold text-lg"
              suppressHydrationWarning
            >
              {mounted && typeof window !== 'undefined'
                ? new URLSearchParams(window.location.search).get(
                    'referral_code'
                  ) || 'REFERRAL_CODE'
                : 'REFERRAL_CODE'}
            </code>
            <EnhancedCopyButton
              value={
                mounted && typeof window !== 'undefined'
                  ? new URLSearchParams(window.location.search).get(
                      'referral_code'
                    ) || 'REFERRAL_CODE'
                  : 'REFERRAL_CODE'
              }
            />
          </div>
          <p className="text-green-800 dark:text-green-200 text-sm mt-2">
            Paste this in the CLI to claim your bonus credits!
          </p>
        </div>
      )}
    </div>
  )

  const renderPrerequisitesStep = () => (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Check Prerequisites</h3>
      <p className="text-muted-foreground">
        First, let's make sure you have Node.js (or Bun/Deno) installed.
      </p>

      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-blue-800 dark:text-blue-200 text-sm">
          <strong>Check your runtime:</strong> Open your terminal and run one
          of:
        </p>
        <div className="mt-2 space-y-1 text-xs font-mono">
          <div>
            <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">
              node --version
            </code>{' '}
            (Node.js)
          </div>
          <div>
            <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">
              bun --version
            </code>{' '}
            (Bun)
          </div>
          <div>
            <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">
              deno --version
            </code>{' '}
            (Deno)
          </div>
        </div>
      </div>

      {progress.os === 'windows' && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-yellow-800 dark:text-yellow-200 text-sm">
            <strong>Windows users:</strong> You may need to run your terminal as
            Administrator for global npm installs.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Need a runtime?</p>
        <p className="text-sm">Visit one of these below to set up a runtime:</p>
        <div className="flex flex-wrap gap-2 pt-4">
          <Button variant="outline" size="sm" asChild>
            <a
              href="https://nodejs.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              Node.js <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild className="relative">
            <a href="https://bun.sh" target="_blank" rel="noopener noreferrer">
              Bun <ExternalLink className="w-3 h-3 ml-1" />
              <span className="absolute -top-4 -right-5 bg-[#7CFF3F] text-black text-[7px] px-1 py-0.5 rounded-full font-medium transform -rotate-12 whitespace-nowrap">
                our fave!
              </span>
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a
              href="https://deno.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Deno <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  )

  const renderInstallStep = () => (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Install Codebuff</h3>
      <p className="text-muted-foreground">
        Now let's install the Codebuff CLI tool globally on your system.
      </p>

      {/* Package Manager Tabs */}
      <div className="inline-flex space-x-1 bg-muted p-1 rounded-lg">
        {(['npm', 'yarn', 'pnpm', 'bun'] as PackageManager[]).map((pm) => (
          <button
            key={pm}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors relative',
              progress.packageManager === pm
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => handlePMChange(pm)}
          >
            {pm}
            <span
              className={`absolute -top-4 -right-5 bg-[#7CFF3F] text-black text-[7px] px-1 py-0.5 rounded-full font-medium transform -rotate-12 whitespace-nowrap ${
                pm === 'bun' ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              our fave!
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div className="bg-zinc-800/60 border border-zinc-700/50 hover:border-[#00FF9580] hover:shadow-[0_0_15px_#00FF9540] rounded-md overflow-hidden relative px-3 py-2.5 flex items-center justify-between transition-all duration-300 cursor-pointer group">
          <code className="font-mono text-white/90 select-all text-sm">
            {getInstallCommand(progress.packageManager)}
          </code>
          <EnhancedCopyButton
            value={getInstallCommand(progress.packageManager)}
          />
        </div>
      </div>
    </div>
  )

  const renderOpenTerminalStep = () => (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Open Your Terminal</h3>
      <p className="text-muted-foreground">
        Open your terminal in your favorite code editor.
      </p>

      <div className="grid grid-cols-2 gap-3">
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
              posthog.capture('onboarding_editor_opened', {
                editor: editor.name,
              })
            }}
            aria-label={`Open in ${editor.name}`}
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-5 h-5 relative flex-shrink-0',
                  editor.needsWhiteBg && 'bg-white rounded-sm p-[1px]'
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
  )

  const renderNavigateStep = () => (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Navigate to Your Project</h3>
      <p className="text-muted-foreground">
        Navigate to the directory where you want to use Codebuff. This should be
        your coding project folder.
      </p>

      <div className="bg-zinc-800/60 border border-zinc-700/50 hover:border-[#00FF9580] hover:shadow-[0_0_15px_#00FF9540] rounded-md overflow-hidden relative px-3 py-2.5 flex items-center justify-between transition-all duration-300 cursor-pointer group">
        <code className="font-mono text-white/90 select-all text-sm">
          cd /path/to/your-project
        </code>
        <EnhancedCopyButton value="cd /path/to/your-project" />
      </div>

      <div className="bg-gray-50 dark:bg-gray-900 border rounded-lg p-4">
        <p className="text-sm font-medium mb-2">Examples:</p>
        <div className="space-y-1 text-sm text-muted-foreground font-mono">
          <div>cd ~/my-react-app</div>
          <div>cd ~/Documents/my-python-project</div>
          <div>cd C:\\Users\\username\\my-project</div>
        </div>
      </div>
    </div>
  )

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

      <div className="bg-background border rounded-lg max-w-4xl mx-auto flex flex-col h-[calc(100vh-8rem)] md:h-auto md:min-h-[600px]">
        {/* Progress Breadcrumbs - only show after step 0 on mobile */}
        {progress.currentStep > 0 && isMobile && (
          <div className="flex justify-center pt-6 pb-4">
            <div className="flex items-center gap-2">
              {Array.from({ length: getTotalSteps() - 1 }, (_, index) => (
                <div
                  key={index}
                  className={cn(
                    'rounded-full transition-all duration-300',
                    index === progress.currentStep - 1
                      ? 'w-3 h-3 bg-primary' // Current step
                      : index < progress.currentStep - 1
                        ? 'w-2 h-2 bg-primary' // Completed steps
                        : 'w-2 h-2 bg-muted' // Future steps
                  )}
                />
              ))}
            </div>
          </div>
        )}
        {/* Step Content */}
        <div
          className={cn(
            'flex-1 overflow-y-auto p-8 md:min-h-[400px]',
            isMobile && 'pb-24' // Add bottom padding on mobile to account for fixed buttons
          )}
        >
          {/* Step 0: Welcome with dev setup choice */}
          {progress.currentStep === 0 && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Welcome to Codebuff! 🎉</h3>
              {!hasReferralCode && (
                <p className="text-muted-foreground">
                  Let's get you set up with Codebuff in just a few quick steps.
                  This should take about 2-3 minutes.
                </p>
              )}
              {hasReferralCode && (
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <p className="text-green-800 dark:text-green-200 font-medium">
                    🎁 You have a referral code that will give you bonus
                    credits!
                  </p>
                  <p className="text-green-800 dark:text-green-200 text-sm mt-1">
                    We'll show you how to redeem it at the end of setup
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <p className="font-medium">
                  Do you already have a development environment set up?
                </p>
                <div className="grid grid-cols-1 gap-3">
                  <button
                    className={`p-4 border rounded-lg text-left transition-colors ${
                      progress.hasDevSetup === false
                        ? 'border-primary bg-primary/5'
                        : 'border-muted hover:border-primary/50'
                    }`}
                    onClick={() => {
                      setProgress((prev) => ({ ...prev, hasDevSetup: false }))
                      posthog.capture('onboarding_dev_setup_selected', {
                        hasDevSetup: false,
                      })
                    }}
                  >
                    <div className="font-medium">I don't have a dev setup</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      We'll walk you through installing Node.js, package
                      managers, and Codebuff step by step
                    </div>
                  </button>
                  <button
                    className={`p-4 border rounded-lg text-left transition-colors ${
                      progress.hasDevSetup === true
                        ? 'border-primary bg-primary/5'
                        : 'border-muted hover:border-primary/50'
                    }`}
                    onClick={() => {
                      setProgress((prev) => ({ ...prev, hasDevSetup: true }))
                      posthog.capture('onboarding_dev_setup_selected', {
                        hasDevSetup: true,
                      })
                    }}
                  >
                    <div className="font-medium">I have a dev setup</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Skip the setup steps - I already have npm or an equivalent
                      and can install global packages
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Render other steps based on dev setup choice */}
          {progress.currentStep > 0 && (
            <div>
              {/* Dev setup flow */}
              {progress.hasDevSetup && (
                <>
                  {progress.currentStep === 1 && renderRunCodebuffStep()}
                  {progress.currentStep === 2 && renderConnectAccountStep()}
                </>
              )}

              {/* Full setup flow */}
              {!progress.hasDevSetup && (
                <>
                  {progress.currentStep === 1 && renderPrerequisitesStep()}
                  {progress.currentStep === 2 && renderInstallStep()}
                  {progress.currentStep === 3 && renderOpenTerminalStep()}
                  {progress.currentStep === 4 && renderNavigateStep()}
                  {progress.currentStep === 5 && renderRunCodebuffStep()}
                  {progress.currentStep === 6 && renderConnectAccountStep()}
                  {progress.currentStep >= 7 && renderFinishStep()}
                </>
              )}
            </div>
          )}
        </div>
        {/* Navigation */}
        <div
          className={cn(
            'flex items-center justify-between p-8 md:pt-6 pt-4 pb-4 md:pb-8 border-t mt-auto',
            isMobile &&
              'fixed bottom-0 left-0 right-0 bg-background border-t border-border z-10 rounded-none'
          )}
        >
          {progress.currentStep > 0 ? (
            <Button
              variant="outline"
              onClick={prevStep}
              className="flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
          ) : (
            <div /> /* Empty div to balance flexbox */
          )}

          {/* Progress Breadcrumbs - show in footer on desktop */}
          {progress.currentStep > 0 && !isMobile && (
            <div className="flex items-center gap-2">
              {Array.from({ length: getTotalSteps() - 1 }, (_, index) => (
                <div
                  key={index}
                  className={cn(
                    'rounded-full transition-all duration-300',
                    index === progress.currentStep - 1
                      ? 'w-3 h-3 bg-primary' // Current step
                      : index < progress.currentStep - 1
                        ? 'w-2 h-2 bg-primary' // Completed steps
                        : 'w-2 h-2 bg-muted' // Future steps
                  )}
                />
              ))}
            </div>
          )}

          <Button onClick={nextStep} className="flex items-center gap-2">
            {progress.currentStep === getTotalSteps() - 1 ? 'Finish' : 'Next'}
            {progress.currentStep < getTotalSteps() - 1 && (
              <ChevronRight className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </>
  )
}
