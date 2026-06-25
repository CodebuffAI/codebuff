'use client'

import { api } from '@/convex/_generated/api'
import { useAction } from 'convex/react'
import { useEffect, useMemo, useState } from 'react'
import {
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  Code2,
  PanelRight,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react'

type CustomLink = {
  id: string
  label: string
  url: string
  embed: boolean
  description: string | null
}

export function CloudCustomLinksPanel({
  semanticIdentifier,
  onOpenView,
}: {
  semanticIdentifier: string
  onOpenView: (view: 'code' | 'terminal') => void
}) {
  const getCustomLinks = useAction(api.cloud.customLinks.getCustomLinks)
  const [links, setLinks] = useState<CustomLink[]>([])
  const [configPath, setConfigPath] = useState('.freebuff/custom-links.json')
  const [exists, setExists] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [embedLink, setEmbedLink] = useState<CustomLink | null>(null)

  const sampleConfig = useMemo(
    () =>
      JSON.stringify(
        {
          links: [
            {
              id: 'supabase',
              label: 'Supabase Dashboard',
              url: 'https://supabase.com/dashboard/project/<project-id>',
              embed: false,
            },
            {
              id: 'convex',
              label: 'Convex Dashboard',
              url: 'https://dashboard.convex.dev/d/<deployment>',
              embed: false,
            },
          ],
        },
        null,
        2,
      ),
    [],
  )

  const refresh = async () => {
    setLoading(true)
    try {
      const result = await getCustomLinks({ semanticIdentifier })
      setLinks(result.links)
      setConfigPath(result.configPath)
      setExists(result.exists)
      setParseError(result.parseError)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [semanticIdentifier])

  if (embedLink) {
    return (
      <div className="flex h-full w-full flex-col bg-card">
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setEmbedLink(null)}
              className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <span className="truncate text-sm font-medium text-foreground">
              {embedLink.label}
            </span>
          </div>
          <button
            type="button"
            onClick={() => window.open(embedLink.url, '_blank', 'noopener,noreferrer')}
            className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <iframe
            className="h-full w-full border-0"
            src={embedLink.url}
            title={embedLink.label}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PanelRight className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Custom Links & Panels</h3>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Reload
        </button>
      </div>

      {parseError && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{parseError}</span>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-xs text-muted-foreground">
          Add links by editing <code>{configPath}</code> in your repo. The AI can
          also edit this file to add dashboards and tools.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenView('code')}
            className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-foreground/85 hover:bg-muted"
          >
            <Code2 className="h-3.5 w-3.5" />
            Open VS Code
          </button>
          {!exists && (
            <span className="text-[11px] text-muted-foreground">
              File not found yet - create it with the sample below.
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <p className="mb-2 text-xs font-medium text-foreground">Sample config</p>
        <pre className="overflow-x-auto rounded-md bg-background p-3 text-[11px] text-muted-foreground">
{sampleConfig}
        </pre>
      </div>

      <div className="space-y-2">
        {links.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            No custom links configured yet.
          </div>
        ) : (
          links.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{link.label}</p>
                <p className="truncate text-xs text-muted-foreground">{link.url}</p>
                {link.description && (
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {link.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {link.embed && (
                  <button
                    type="button"
                    onClick={() => setEmbedLink(link)}
                    className="flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs text-foreground/85 hover:bg-muted"
                  >
                    <PanelRight className="h-3.5 w-3.5" />
                    Embed
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    window.open(link.url, '_blank', 'noopener,noreferrer')
                  }
                  className="flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs text-foreground/85 hover:bg-muted"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" />
        Tip: set <code>embed: true</code> for tools that allow iframe embedding.
      </p>
    </div>
  )
}
