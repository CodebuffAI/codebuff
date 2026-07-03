'use client'

import { AlertTriangle, RotateCw } from 'lucide-react'
import { Spinner3D } from './Spinner3D'
import { workspaceWakingCopy } from './useWorkspaceReadiness'

/**
 * Full-pane loading state shown in place of the Code/Terminal iframe while
 * the sandbox wakes and VS Code / ttyd come up. The copy escalates over time
 * (cold archived sandboxes can take a minute or two) and an indeterminate
 * progress bar signals active work — this replaces the raw Daytona proxy
 * error JSON that used to render here.
 */
export function WorkspaceWakingPanel({
  service,
  elapsedSeconds,
}: {
  service: 'code' | 'terminal'
  elapsedSeconds: number
}) {
  const { title, subtitle } = workspaceWakingCopy(service, elapsedSeconds)
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-background p-6 text-center">
      <Spinner3D size={34} />
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mx-auto mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="h-1 w-56 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-[workspace-waking_1.4s_ease-in-out_infinite] rounded-full bg-primary/70" />
      </div>
      {/* Local keyframes so this stays drop-in without touching the global CSS. */}
      <style
        dangerouslySetInnerHTML={{
          __html:
            '@keyframes workspace-waking { 0% { transform: translateX(-120%); } 100% { transform: translateX(280%); } }',
        }}
      />
    </div>
  )
}

export function WorkspaceErrorPanel({
  service,
  error,
  onRetry,
}: {
  service: 'code' | 'terminal'
  error: string | null
  onRetry: () => void
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-background p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-md border border-red-400/30 bg-red-500/10">
        <AlertTriangle className="h-6 w-6 text-red-400" />
      </div>
      <div className="max-w-md">
        <p className="text-sm font-semibold text-foreground">
          Couldn&apos;t open {service === 'code' ? 'VS Code' : 'the terminal'}
        </p>
        <p className="mx-auto mt-1 break-words text-xs text-muted-foreground">
          {error ??
            'The sandbox did not come up in time. It may still be restoring.'}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-[13px] font-medium text-foreground transition hover:bg-muted"
      >
        <RotateCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  )
}
