'use client'

import { useState } from 'react'
import { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { Copy, ExternalLink, Check, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'

const DaytonaFSDashboard = dynamic(() => import('../DaytonaFSDashboard'), {
  ssr: false,
})

type Project = NonNullable<FunctionReturnType<typeof api.project.getProjectData>>

interface CloudGodModePanelProps {
  project: Project
}

function SandboxLink({
  href,
  label,
  port,
}: {
  href: string
  label: string
  port: number
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
      <span className="min-w-[90px] text-xs font-medium text-muted-foreground">
        {label}
        <span className="ml-1 text-[10px] text-muted-foreground/60">:{port}</span>
      </span>
      <span className="flex-1 truncate font-mono text-[11px] text-foreground/70">
        {href}
      </span>
      <button
        onClick={handleCopy}
        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
        title="Copy URL"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-400" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
        title="Open in new tab"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

export function CloudGodModePanel({ project }: CloudGodModePanelProps) {
  const rawSandboxId = project.sandbox_id ?? ''
  const sandboxId = rawSandboxId.startsWith('daytona:')
    ? rawSandboxId.slice('daytona:'.length)
    : rawSandboxId

  const proxy = sandboxId
    ? (port: number) => `https://${port}-${sandboxId}.proxy.daytona.works`
    : null

  const runtimeConfig = project.runtime_config as
    | { preview_command?: string | null; preview_port?: number | null; build_command?: string | null }
    | null
    | undefined

  const handleCopySandboxId = () => {
    navigator.clipboard.writeText(sandboxId)
    toast.success('Copied sandbox ID')
  }

  return (
    <div className="flex h-full w-full flex-col gap-5 overflow-y-auto p-4">
      {/* Header */}
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
        <span className="text-sm font-medium text-amber-300">God Mode — admin only</span>
      </div>

      {/* Sandbox ID */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sandbox</h3>
        <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
          <span className="min-w-[90px] text-xs font-medium text-muted-foreground">sandbox_id</span>
          <span className="flex-1 truncate font-mono text-[11px] text-foreground/70">{sandboxId || '—'}</span>
          {sandboxId && (
            <button onClick={handleCopySandboxId} className="rounded p-0.5 text-muted-foreground hover:text-foreground" title="Copy">
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </section>

      {/* Service links */}
      {proxy && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Service URLs (direct Daytona proxy)
          </h3>
          <div className="space-y-1.5">
            <SandboxLink href={proxy(43867)} label="VS Code" port={43867} />
            <SandboxLink href={proxy(7681)} label="Terminal" port={7681} />
            {runtimeConfig?.preview_port && (
              <SandboxLink href={proxy(runtimeConfig.preview_port)} label="Preview" port={runtimeConfig.preview_port} />
            )}
            {project.preview_url && (
              <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
                <span className="min-w-[90px] text-xs font-medium text-muted-foreground">preview_url</span>
                <a href={project.preview_url} target="_blank" rel="noopener noreferrer"
                  className="flex-1 truncate font-mono text-[11px] text-blue-400 hover:underline">
                  {project.preview_url}
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Runtime config */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Runtime config</h3>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-border/50 bg-muted/30 p-3 font-mono text-[11px] text-foreground/70">
          {JSON.stringify(runtimeConfig ?? {}, null, 2)}
        </pre>
      </section>

      {/* Filesystem */}
      {project._id && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filesystem</h3>
          <DaytonaFSDashboard projectId={project._id} />
        </section>
      )}
    </div>
  )
}
