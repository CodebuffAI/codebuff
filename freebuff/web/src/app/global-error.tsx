'use client'

import { useEffect } from 'react'

/**
 * Returns true for "stale deploy" chunk-load failures — a tab holding the
 * previous build's HTML asks for hashed chunk filenames that 404 after a new
 * deploy. `reset()` can't recover those (the file is still gone), so we hard
 * reload to fetch the new document + chunk manifest instead.
 */
function isChunkLoadError(error: Error | undefined): boolean {
  if (!error) return false
  const message = `${error.name}: ${error.message}`
  return (
    message.includes('ChunkLoadError') ||
    message.includes('Loading chunk') ||
    message.includes('Loading CSS chunk') ||
    message.includes("(reading 'call')")
  )
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const chunkError = isChunkLoadError(error)

  useEffect(() => {
    if (!chunkError) return
    try {
      const key = 'fb_chunk_reload_at'
      const last = Number(sessionStorage.getItem(key) ?? '0')
      if (Number.isFinite(last) && Date.now() - last < 30_000) return
      sessionStorage.setItem(key, String(Date.now()))
    } catch {
      // ignore unavailable sessionStorage; reload regardless.
    }
    window.location.reload()
  }, [chunkError])

  return (
    <html lang="en">
      <body className="bg-black text-white">
        <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
          {chunkError ? (
            <>
              <h1 className="text-2xl font-semibold mb-3">Updating…</h1>
              <p className="text-zinc-400">
                A new version just shipped — reloading to get the latest.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-6xl font-bold mb-4">500</h1>
              <p className="text-xl text-zinc-400 mb-8">Something went wrong</p>
              <button
                onClick={() => reset()}
                className="px-6 py-3 bg-white text-black rounded-lg hover:bg-zinc-200 transition-colors"
              >
                Try again
              </button>
            </>
          )}
        </div>
      </body>
    </html>
  )
}
