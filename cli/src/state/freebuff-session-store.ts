import { create } from 'zustand'

import type { FreebuffSessionResponse } from '../types/codebirds-session'

/**
 * Shared state for the codebirds waiting-room session.
 *
 * The hook in `use-codebirds-session.ts` owns the poll loop and writes into
 * this store; React components subscribe via selectors, and non-React code
 * reads via `useFreebuffSessionStore.getState()`.
 *
 * Imperative session controls (force re-POST, mark superseded/ended) live on
 * the module exports of `use-codebirds-session.ts` rather than on this store —
 * that way callers don't need to null-check a "driver" slot whose lifetime
 * is tied to the React tree.
 */
interface FreebuffSessionStore {
  session: FreebuffSessionResponse | null
  error: string | null

  setSession: (session: FreebuffSessionResponse | null) => void
  setError: (error: string | null) => void
}

export const useFreebuffSessionStore = create<FreebuffSessionStore>((set) => ({
  session: null,
  error: null,
  setSession: (session) => set({ session }),
  setError: (error) => set({ error }),
}))
