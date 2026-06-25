'use client'

import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import {
  FileCog,
  TerminalSquare,
  Globe2,
  X,
  ArrowRight,
  Rocket,
} from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { CloudTab } from './CloudWorkspaceTabs'

/**
 * Compact, dismissible getting-started checklist shown above the workspace for
 * freshly connected repos. Points the user at the steps that aren't automatic
 * anymore: configuring env/auth and starting the preview themselves.
 *
 * Dismissal is persisted server-side (`cloud_onboarding_dismissed` on the
 * project) so it never comes back for this project on any device. localStorage
 * is used only as an instant optimistic fast-path while the mutation lands.
 */
export function CloudOnboardingChecklist({
  semanticIdentifier,
  serverDismissed = false,
  onOpenTab,
}: {
  semanticIdentifier: string
  serverDismissed?: boolean
  onOpenTab: (tab: CloudTab) => void
}) {
  const storageKey = `freebuff:cloud:onboarding-dismissed:${semanticIdentifier}`
  const setDismissedServer = useMutation(
    api.project.setCloudOnboardingDismissed,
  )
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (serverDismissed) {
      setDismissed(true)
      return
    }
    try {
      setDismissed(localStorage.getItem(storageKey) === '1')
    } catch {
      setDismissed(false)
    }
  }, [storageKey, serverDismissed])

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(storageKey, '1')
    } catch {
      // ignore
    }
    void setDismissedServer({ semanticIdentifier, dismissed: true }).catch(
      () => {
        // Server write failed; localStorage still keeps it dismissed locally.
      },
    )
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
      description:
        'Add API keys, auth secrets, and callback URLs in .env / .env.local.',
      action: () => onOpenTab('env'),
      cta: 'Open API Keys',
    },
    {
      Icon: TerminalSquare,
      title: 'Authenticate & configure',
      description:
        'Run interactive auth flows (Supabase, Convex, OAuth CLIs) in terminal/VS Code.',
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
