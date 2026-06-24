'use client'

import { useEffect, useState } from 'react'
import {
  FileCog,
  TerminalSquare,
  Globe2,
  X,
  ArrowRight,
  Rocket,
} from 'lucide-react'
import type { CloudTab } from './CloudWorkspaceTabs'

/**
 * Compact, dismissible getting-started checklist shown above the workspace for
 * freshly connected repos. Points the user at the steps that aren't automatic
 * anymore: configuring env/auth and starting the preview themselves.
 */
export function CloudOnboardingChecklist({
  semanticIdentifier,
  onOpenTab,
}: {
  semanticIdentifier: string
  onOpenTab: (tab: CloudTab) => void
}) {
  const storageKey = `freebuff:cloud:onboarding-dismissed:${semanticIdentifier}`
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(storageKey) === '1')
    } catch {
      setDismissed(false)
    }
  }, [storageKey])

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(storageKey, '1')
    } catch {
      // ignore
    }
  }

  if (dismissed) return null

  const steps: {
    Icon: typeof FileCog
    title: string
    description: string
    action: () => void
    cta: string
  }[] = [
    {
      Icon: FileCog,
      title: 'Set environment variables',
      description: 'Add API keys, secrets, and .env config the app needs.',
      action: () => onOpenTab('env'),
      cta: 'Open Env',
    },
    {
      Icon: TerminalSquare,
      title: 'Authenticate & configure',
      description:
        'Run any interactive login/setup in the terminal or VS Code.',
      action: () => onOpenTab('terminal'),
      cta: 'Open Terminal',
    },
    {
      Icon: Globe2,
      title: 'Start the preview',
      description:
        "The dev server doesn't auto-start. Start it from Preview when ready.",
      action: () => onOpenTab('preview'),
      cta: 'Open Preview',
    },
  ]

  return (
    <div className="mx-2 mt-2 rounded-xl border border-border bg-card/70 p-3 lg:mx-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            Finish setting up your sandbox
          </span>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {steps.map(({ Icon, title, description, action, cta }) => (
          <button
            key={title}
            type="button"
            onClick={action}
            className="group flex flex-col gap-1 rounded-lg border border-border bg-background/60 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Icon className="h-3.5 w-3.5 text-primary" />
              {title}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {description}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-primary">
              {cta}
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
