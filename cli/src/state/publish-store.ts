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
  reset: () => void
}

type PublishStore = PublishState & PublishActions

const initialState: PublishState = {
  publishMode: false,
  selectedAgentIds: new Set(),
  searchQuery: '',
  currentStep: 'selection',
  focusedIndex: 0,
  isPublishing: false,
  successResult: null,
  errorResult: null,
}

export const usePublishStore = create<PublishStore>()(
  immer((set) => ({
    ...initialState,

    openPublishMode: () =>
      set((state) => {
        state.publishMode = true
        state.currentStep = 'selection'
        state.selectedAgentIds = new Set()
        state.searchQuery = ''
        state.focusedIndex = 0
        state.isPublishing = false
      }),

    closePublish: () =>
      set((state) => {
        state.publishMode = false
        state.currentStep = 'selection'
        state.selectedAgentIds = new Set()
        state.searchQuery = ''
        state.focusedIndex = 0
        state.isPublishing = false
      }),

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
      set((state) => {
        state.selectedAgentIds = new Set(agentIds)
        state.currentStep = 'confirmation'
        state.publishMode = true
        state.isPublishing = false
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

    reset: () =>
      set(() => ({
        ...initialState,
        selectedAgentIds: new Set(),
        successResult: null,
        errorResult: null,
      })),
  })),
)
