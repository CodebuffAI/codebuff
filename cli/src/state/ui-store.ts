import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type UiStoreState = {
  focusedAgentId: string | null
  inputFocused: boolean
}

export type UiStoreActions = {
  setFocusedAgentId: (
    value: string | null | ((prev: string | null) => string | null),
  ) => void
  setInputFocused: (focused: boolean) => void
}

export type UiStore = UiStoreState & UiStoreActions

const initialState: UiStoreState = {
  focusedAgentId: null,
  inputFocused: true,
}

export const useUiStore = create<UiStore>()(
  immer((set) => ({
    ...initialState,

    setFocusedAgentId: (value) =>
      set((state) => {
        state.focusedAgentId =
          typeof value === 'function' ? value(state.focusedAgentId) : value
      }),

    setInputFocused: (focused) =>
      set((state) => {
        state.inputFocused = focused
      }),
  })),
)
