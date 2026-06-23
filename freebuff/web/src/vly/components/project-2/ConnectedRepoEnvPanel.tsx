'use client'

import { api } from '@/convex/_generated/api'
import { useAction } from 'convex/react'
import { useState } from 'react'
import { Button } from '@/vly/components/ui/button'
import { Input } from '@/vly/components/ui/input'
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

  const handleLoad = async (path = filePath) => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const result = await getEnvFile({ semanticIdentifier, filePath: path })
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
            Environment variables
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
        Edit a config file inside the repo (e.g. <code>.env</code>,{' '}
        <code>.env.local</code>). For interactive auth or complex setup, use the
        hosted VS Code or terminal.
      </p>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
            File path (repo-relative)
          </label>
          <Input
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            placeholder=".env"
            className="h-8 font-mono text-xs"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => handleLoad()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            'Load'
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
