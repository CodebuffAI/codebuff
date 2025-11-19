import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type StreamStatus = 'idle' | 'waiting' | 'streaming'

export type QueueStoreState = {
  queuedMessages: string[]
  streamStatus: StreamStatus
  canProcessQueue: boolean
  queuePaused: boolean
}

export type QueueStoreActions = {
  addToQueue: (message: string) => void
  clearQueue: () => string[]
  pauseQueue: () => void
  resumeQueue: () => void
  setStreamStatus: (status: StreamStatus) => void
  setCanProcessQueue: (can: boolean) => void
  startStreaming: () => void
  stopStreaming: () => void
}

export type QueueStore = QueueStoreState & QueueStoreActions

const initialState: QueueStoreState = {
  queuedMessages: [],
  streamStatus: 'idle',
  canProcessQueue: true,
  queuePaused: false,
}

export const useQueueStore = create<QueueStore>()(
  immer((set, get) => ({
    ...initialState,

    addToQueue: (message) =>
      set((state) => {
        state.queuedMessages.push(message)
      }),

    clearQueue: () => {
      const current = get().queuedMessages
      set((state) => {
        state.queuedMessages = []
      })
      return current
    },

    pauseQueue: () =>
      set((state) => {
        state.queuePaused = true
        state.canProcessQueue = false
      }),

    resumeQueue: () =>
      set((state) => {
        state.queuePaused = false
        state.canProcessQueue = true
      }),

    setStreamStatus: (status) =>
      set((state) => {
        state.streamStatus = status
      }),

    setCanProcessQueue: (can) =>
      set((state) => {
        state.canProcessQueue = can
      }),

    startStreaming: () =>
      set((state) => {
        state.streamStatus = 'streaming'
        state.canProcessQueue = false
      }),

    stopStreaming: () =>
      set((state) => {
        const wasPaused = state.queuePaused
        state.streamStatus = 'idle'
        state.canProcessQueue = !wasPaused
      }),
  })),
)
