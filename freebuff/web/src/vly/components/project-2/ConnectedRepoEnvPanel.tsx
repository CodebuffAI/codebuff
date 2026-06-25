'use client'

import { api } from '@/convex/_generated/api'
import { useAction } from 'convex/react'
import { useEffect, useState } from 'react'
import { Button } from '@/vly/components/ui/button'
import { Loader2, Save, FileCog, Terminal, Code2 } from 'lucide-react'

/**
 * Env-var / config-file editor for connected-repo (Freebuff Cloud) projects.
 * Writes raw file contents (e.g. `.env`) into the cloned repo's sandbox. This
 * is the quick path; the hosted VS Code and terminal tabs are the power-user
 * backup for anything this doesn't cover (auth flows, multi-file config, etc).
 */
export function ConnectedRepoEnvPanel({
  semanticIdentifier,
  onOpenView,
}: {
  semanticIdentifier: string
  onOpenView?: (view: 'code' | 'terminal') => void
}) {
  const getEnvFile = useAction(
    api.cloud.connectRepoEnv.getConnectedRepoEnvFile,
  )
  const setEnvVars = useAction(
    api.cloud.connectRepoEnv.setConnectedRepoEnvVars,
  )

  const [filePath, setFilePath] = useState('.env')
  const [content, setContent] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleLoad = async (path?: '.env' | '.env.local') => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const result = await getEnvFile({
        semanticIdentifier,
        ...(path ? { filePath: path } : {}),
      })
      setContent(result.content)
      setFilePath(result.filePath)
      setLoaded(true)
      if (!result.exists) {
        setMessage(`${result.filePath} doesn't exist yet — it'll be created.`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!loaded && !loading) {
      void handleLoad()
    }
  }, [loaded, loading, semanticIdentifier])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const result = await setEnvVars({
        semanticIdentifier,
        filePath,
        content,
        restartPreview: true,
      })
      setMessage(
        result.previewRestarted
          ? `${result.message} · preview restarted`
          : result.message,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-y-auto bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileCog className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            API Keys
          </h3>
        </div>
        <div className="flex items-center gap-1">
          {onOpenView && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => onOpenView('code')}
              >
                <Code2 className="h-3.5 w-3.5" />
                VS Code
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => onOpenView('terminal')}
              >
                <Terminal className="h-3.5 w-3.5" />
                Terminal
              </Button>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        API Keys uses local env files only. It loads <code>.env</code> first,
        then falls back to <code>.env.local</code> if <code>.env</code> is
        missing.
      </p>

      <div className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2">
        <div className="text-[11px] text-muted-foreground">
          Active file: <code>{filePath}</code>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => handleLoad('.env')}
            disabled={loading}
          >
            Use .env
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => handleLoad('.env.local')}
            disabled={loading}
          >
            Use .env.local
          </Button>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() => handleLoad()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            'Reload'
          )}
        </Button>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onFocus={() => {
          if (!loaded && !loading) handleLoad()
        }}
        spellCheck={false}
        placeholder={'KEY=value\nANOTHER_KEY=value'}
        className="min-h-[200px] flex-1 resize-none rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground outline-none focus:border-primary"
      />

      <div className="flex items-center justify-between gap-2">
        <div className="min-h-[20px] text-xs">
          {error ? (
            <span className="text-red-400">{error}</span>
          ) : message ? (
            <span className="text-emerald-400">{message}</span>
          ) : null}
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save &amp; restart preview
        </Button>
      </div>
    </div>
  )
}
