'use client'

import { useEffect } from 'react'

/**
 * Self-heals "stale deploy" chunk-load failures.
 *
 * After a new deploy ships, a browser tab that was opened against the *previous*
 * build still references the old hashed chunk filenames (e.g.
 * `518-<oldhash>.js`). Those files no longer exist on the CDN, so when React
 * lazily pulls one in during render `__webpack_require__` receives `undefined`
 * and throws either a `ChunkLoadError` or the cryptic
 * `Cannot read properties of undefined (reading 'call')`.
 *
 * The only real fix for a client holding stale HTML is to fetch the new
 * document, so we do a single, guarded hard reload. The `sessionStorage` guard
 * prevents an infinite reload loop in the (unexpected) case the error persists
 * across a fresh load — if it does, we let the error surface normally so it's
 * still visible/loggable instead of thrashing the page.
 */
const RELOAD_GUARD_KEY = 'fb_chunk_reload_at'
const RELOAD_COOLDOWN_MS = 30_000

function isChunkLoadError(value: unknown): boolean {
  const message =
    value instanceof Error
      ? `${value.name}: ${value.message}`
      : typeof value === 'string'
        ? value
        : ''
  if (!message) return false
  return (
    message.includes('ChunkLoadError') ||
    message.includes('Loading chunk') ||
    message.includes('Loading CSS chunk') ||
    // Minified webpack failure thrown when a referenced module factory is
    // missing because its chunk 404'd (the stale-deploy signature).
    message.includes("(reading 'call')")
  )
}

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? '0')
    if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS) {
      // Already reloaded very recently — avoid a loop and let it surface.
      return
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
  } catch {
    // sessionStorage can be unavailable (privacy mode); reload anyway.
  }
  window.location.reload()
}

export function ChunkErrorReloader() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
        reloadOnce()
      }
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadError(event.reason)) {
        reloadOnce()
      }
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
