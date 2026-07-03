'use client'

import { api } from '@/convex/_generated/api'
import { useAction } from 'convex/react'
import { useEffect, useRef, useState } from 'react'

export type WorkspacePhase = 'idle' | 'waking' | 'ready' | 'error'

/**
 * Gate for the Code/Terminal workspace iframes. Mounting them immediately
 * against a paused/archived sandbox renders the Daytona proxy's raw JSON
 * error ("failed to get runner info: Sandbox not found"). This hook calls
 * `cloud.preview.ensureWorkspaceService`, which wakes the sandbox and
 * restarts VS Code / ttyd if needed, and only reports `ready` once the
 * service actually answers HTTP — the caller mounts the iframe then.
 *
 * Waking a cold sandbox can take a minute; `elapsedSeconds` lets the caller
 * escalate the loading copy over time. `retry()` restarts the check after a
 * failure.
 */
export function useWorkspaceReadiness({
  enabled,
  semanticIdentifier,
  service,
}: {
  enabled: boolean
  semanticIdentifier: string
  service: 'code' | 'terminal' | null
}) {
  const ensureWorkspaceService = useAction(
    api.cloud.preview.ensureWorkspaceService,
  )
  const [phase, setPhase] = useState<WorkspacePhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [retryNonce, setRetryNonce] = useState(0)
  const attemptRef = useRef(0)

  useEffect(() => {
    if (!enabled || !service || !semanticIdentifier) {
      setPhase('idle')
      setError(null)
      setElapsedSeconds(0)
      return
    }

    let cancelled = false
    const attempt = ++attemptRef.current
    setPhase('waking')
    setError(null)
    setElapsedSeconds(0)

    const startedAt = Date.now()
    const elapsedTimer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)

    const run = async (retriesLeft: number) => {
      try {
        const result = await ensureWorkspaceService({
          semanticIdentifier,
          service,
        })
        if (cancelled || attempt !== attemptRef.current) return
        if (result.ready) {
          setPhase('ready')
          return
        }
        if (retriesLeft > 0) {
          window.setTimeout(() => void run(retriesLeft - 1), 3000)
          return
        }
        setPhase('error')
        setError(result.message)
      } catch (e) {
        if (cancelled || attempt !== attemptRef.current) return
        if (retriesLeft > 0) {
          window.setTimeout(() => void run(retriesLeft - 1), 3000)
          return
        }
        setPhase('error')
        setError(
          e instanceof Error ? e.message : 'Failed to open the workspace',
        )
      }
    }
    void run(2)

    return () => {
      cancelled = true
      window.clearInterval(elapsedTimer)
    }
  }, [enabled, service, semanticIdentifier, ensureWorkspaceService, retryNonce])

  return {
    phase,
    error,
    elapsedSeconds,
    retry: () => setRetryNonce((n) => n + 1),
  }
}

/** Loading copy that escalates while a cold sandbox restores. */
export function workspaceWakingCopy(service: 'code' | 'terminal', elapsedSeconds: number) {
  const target = service === 'code' ? 'VS Code' : 'the terminal'
  if (elapsedSeconds < 8) {
    return {
      title: `Opening ${target}…`,
      subtitle: 'Connecting to your computer.',
    }
  }
  if (elapsedSeconds < 40) {
    return {
      title: 'Waking up your computer…',
      subtitle: `Starting the sandbox, then ${target}.`,
    }
  }
  return {
    title: 'Still starting…',
    subtitle: 'Restoring an archived sandbox can take a minute or two.',
  }
}
