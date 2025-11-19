import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type StreamStoreState = {
  streamingAgents: Set<string>
  activeSubagents: Set<string>
  isChainInProgress: boolean
  abortController: AbortController | null
}

export type StreamStoreActions = {
  setStreamingAgents: (
    value: Set<string> | ((prev: Set<string>) => Set<string>),
  ) => void
  setActiveSubagents: (
    value: Set<string> | ((prev: Set<string>) => Set<string>),
  ) => void
  setIsChainInProgress: (value: boolean) => void
  setAbortController: (controller: AbortController | null) => void
  abortStream: () => void
}

export type StreamStore = StreamStoreState & StreamStoreActions

const initialState: StreamStoreState = {
  streamingAgents: new Set<string>(),
  activeSubagents: new Set<string>(),
  isChainInProgress: false,
  abortController: null,
}

export const useStreamStore = create<StreamStore>()(
  immer((set, get) => ({
    ...initialState,

    setStreamingAgents: (value) =>
      set((state) => {
        state.streamingAgents =
          typeof value === 'function'
            ? value(state.streamingAgents)
            : value
      }),

    setActiveSubagents: (value) =>
      set((state) => {
        state.activeSubagents =
          typeof value === 'function'
            ? value(state.activeSubagents)
            : value
      }),

    setIsChainInProgress: (value) =>
      set((state) => {
        state.isChainInProgress = value
      }),

    setAbortController: (controller) =>
      set((state) => {
        state.abortController = controller
      }),

    abortStream: () => {
      const controller = get().abortController
      controller?.abort()
      set((state) => {
        state.abortController = null
      })
    },
  })),
)
