'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'freebuff_cloud_auth'
const CLOUD_PASSWORD = 'vlyai'

/**
 * Lightweight testing gate for the isolated /cloud area. This is intentionally
 * a basic client-side password (not real security) so we can test Freebuff
 * Cloud in production without exposing it publicly. Replace/remove when the
 * feature graduates into /web.
 */
export function CloudPasswordGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false)
  const [checked, setChecked] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    try {
      // localStorage so the password only needs to be entered once per device
      // (persists across sessions/tabs), not every new session.
      if (localStorage.getItem(STORAGE_KEY) === CLOUD_PASSWORD) {
        setUnlocked(true)
      }
    } catch {
      // localStorage unavailable — fall through to the prompt.
    }
    setChecked(true)
  }, [])

  if (!checked) {
    return null
  }

  if (unlocked) {
    return <>{children}</>
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value === CLOUD_PASSWORD) {
      try {
        localStorage.setItem(STORAGE_KEY, CLOUD_PASSWORD)
      } catch {
        // Ignore storage failures; unlock for this session anyway.
      }
      setUnlocked(true)
    } else {
      setError(true)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-white/10 bg-white/5 p-6 text-center"
      >
        <h1 className="mb-1 text-lg font-semibold text-white">
          Freebuff Cloud
        </h1>
        <p className="mb-4 text-sm text-white/50">
          Internal testing area. Enter the password to continue.
        </p>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(false)
          }}
          placeholder="Password"
          className="mb-3 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
        />
        {error && (
          <p className="mb-3 text-sm text-red-400">Incorrect password.</p>
        )}
        <button
          type="submit"
          className="w-full rounded-md bg-white px-3 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
        >
          Enter
        </button>
      </form>
    </div>
  )
}
