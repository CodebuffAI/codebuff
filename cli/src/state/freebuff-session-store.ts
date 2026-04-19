import { create } from 'zustand'

import type { FreebuffSessionResponse } from '../types/freebuff-session'

/**
 * Shared state for the freebuff waiting-room session.
 *
 * The hook in `use-freebuff-session.ts` owns the poll loop and writes into
 * this store; React components subscribe via selectors, and non-React code
 * reads state via `useFreebuffSessionStore.getState()` (same pattern as the
 * chat store).
 *
 * The `driver` slot is set by the hook on mount and cleared on unmount. It
 * lets external callers (chat-completions gate handler, exit paths) poke at
 * the live poll loop — e.g. to force a re-POST or flip into a terminal
 * state. Nulled when no hook is mounted, so non-React callers must
 * null-check before using.
 */
export interface FreebuffSessionDriver {
  refresh: (opts?: { forcePost?: boolean }) => Promise<void>
  markSuperseded: () => void
  markEnded: () => void
}

interface FreebuffSessionStore {
  session: FreebuffSessionResponse | null
  error: string | null
  driver: FreebuffSessionDriver | null

  setSession: (session: FreebuffSessionResponse | null) => void
  setError: (error: string | null) => void
  setDriver: (driver: FreebuffSessionDriver | null) => void
}

export const useFreebuffSessionStore = create<FreebuffSessionStore>((set) => ({
  session: null,
  error: null,
  driver: null,
  setSession: (session) => set({ session }),
  setError: (error) => set({ error }),
  setDriver: (driver) => set({ driver }),
}))
