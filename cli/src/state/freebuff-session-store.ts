import { create } from 'zustand'

import type { FreebuffSessionResponse } from '../types/freebuff-session'

/**
 * Snapshot of the waiting-room / active-session state reported by the server.
 * Stored globally so both the waiting-room UI and the send-message path can
 * read the current instance id without prop drilling.
 */
interface FreebuffSessionState {
  session: FreebuffSessionResponse | null
  lastFetchError: string | null
}

interface FreebuffSessionActions {
  setSession: (session: FreebuffSessionResponse) => void
  setError: (error: string | null) => void
  reset: () => void
}

type FreebuffSessionStore = FreebuffSessionState & FreebuffSessionActions

const initialState: FreebuffSessionState = {
  session: null,
  lastFetchError: null,
}

export const useFreebuffSessionStore = create<FreebuffSessionStore>((set) => ({
  ...initialState,
  setSession: (session) => set({ session, lastFetchError: null }),
  setError: (lastFetchError) => set({ lastFetchError }),
  reset: () => set(initialState),
}))

/** Read the current instance id for outgoing chat requests. */
export const getFreebuffInstanceId = (): string | undefined => {
  const { session } = useFreebuffSessionStore.getState()
  if (!session) return undefined
  if (session.status === 'queued' || session.status === 'active') {
    return session.instanceId
  }
  return undefined
}
