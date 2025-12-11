import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type PublishStep = 'selection' | 'confirmation' | 'success' | 'error'

export interface PublishSuccessResult {
  publisherId: string
  agents: Array<{
    id: string
    version: string
    displayName: string
  }>
}

export interface PublishErrorResult {
  error: string
  details?: string
  hint?: string
}

interface PublishState {
  publishMode: boolean
  selectedAgentIds: Set<string>
  searchQuery: string
  currentStep: PublishStep
  focusedIndex: number
  isPublishing: boolean
  successResult: PublishSuccessResult | null
  errorResult: PublishErrorResult | null
  /** Whether to include agents that spawn the selected agents (reverse dependencies) */
  includeDependents: boolean
}

interface PublishActions {
  openPublishMode: () => void
  closePublish: () => void
  toggleAgentSelection: (agentId: string) => void
  setSearchQuery: (query: string) => void
  goToConfirmation: () => void
  goBackToSelection: () => void
  setFocusedIndex: (index: number) => void
  preSelectAgents: (agentIds: string[]) => void
  setIsPublishing: (publishing: boolean) => void
  setSuccessResult: (result: PublishSuccessResult) => void
  setErrorResult: (result: PublishErrorResult) => void
  setIncludeDependents: (include: boolean) => void
  reset: () => void
}

type PublishStore = PublishState & PublishActions

const createInitialState = (publishMode = false): PublishState => ({
  publishMode,
  selectedAgentIds: new Set(),
  searchQuery: '',
  currentStep: 'selection',
  focusedIndex: 0,
  isPublishing: false,
  successResult: null,
  errorResult: null,
  includeDependents: false,
})

const initialState: PublishState = createInitialState()

export const usePublishStore = create<PublishStore>()(
  immer((set) => ({
    ...initialState,

    openPublishMode: () => set(() => createInitialState(true)),

    closePublish: () => set(() => createInitialState(false)),

    toggleAgentSelection: (agentId) =>
      set((state) => {
        if (state.selectedAgentIds.has(agentId)) {
          state.selectedAgentIds.delete(agentId)
        } else {
          state.selectedAgentIds.add(agentId)
        }
      }),

    setSearchQuery: (query) =>
      set((state) => {
        state.searchQuery = query
        state.focusedIndex = 0 // Reset focus when search changes
      }),

    goToConfirmation: () =>
      set((state) => {
        state.currentStep = 'confirmation'
        state.focusedIndex = 0
      }),

    goBackToSelection: () =>
      set((state) => {
        state.currentStep = 'selection'
        state.focusedIndex = 0
      }),

    setFocusedIndex: (index) =>
      set((state) => {
        state.focusedIndex = index
      }),

    preSelectAgents: (agentIds) =>
      set(() => {
        const nextState = createInitialState(true)
        nextState.selectedAgentIds = new Set(agentIds)
        // Stay on selection step so user can review/modify before confirming
        nextState.currentStep = 'selection'
        return nextState
      }),

    setIsPublishing: (publishing) =>
      set((state) => {
        state.isPublishing = publishing
      }),

    setSuccessResult: (result) =>
      set((state) => {
        state.successResult = result
        state.currentStep = 'success'
        state.isPublishing = false
      }),

    setErrorResult: (result) =>
      set((state) => {
        state.errorResult = result
        state.currentStep = 'error'
        state.isPublishing = false
      }),

    setIncludeDependents: (include) =>
      set((state) => {
        state.includeDependents = include
      }),

    reset: () => set(() => createInitialState(false)),
  })),
)
