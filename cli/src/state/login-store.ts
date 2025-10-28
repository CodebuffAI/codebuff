import { enableMapSet } from 'immer'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type LoginStoreState = {
  loginUrl: string | null
  loading: boolean
  error: string | null
  fingerprintHash: string | null
  expiresAt: string | null
  isWaitingForEnter: boolean
  hasOpenedBrowser: boolean
  sheenPosition: number
  copyMessage: string | null
  justCopied: boolean
  hasClickedLink: boolean
}

type LoginStoreActions = {
  setLoginUrl: (
    value: string | null | ((prev: string | null) => string | null),
  ) => void
  setLoading: (loading: boolean) => void
  setError: (
    value: string | null | ((prev: string | null) => string | null),
  ) => void
  setFingerprintHash: (
    value: string | null | ((prev: string | null) => string | null),
  ) => void
  setExpiresAt: (
    value: string | null | ((prev: string | null) => string | null),
  ) => void
  setIsWaitingForEnter: (waiting: boolean) => void
  setHasOpenedBrowser: (opened: boolean) => void
  setSheenPosition: (value: number | ((prev: number) => number)) => void
  setCopyMessage: (
    value: string | null | ((prev: string | null) => string | null),
  ) => void
  setJustCopied: (copied: boolean) => void
  setHasClickedLink: (clicked: boolean) => void
  resetLoginState: () => void
}

type LoginStore = LoginStoreState & LoginStoreActions

enableMapSet()

const initialState: LoginStoreState = {
  loginUrl: null,
  loading: false,
  error: null,
  fingerprintHash: null,
  expiresAt: null,
  isWaitingForEnter: false,
  hasOpenedBrowser: false,
  sheenPosition: 0,
  copyMessage: null,
  justCopied: false,
  hasClickedLink: false,
}

export const useLoginStore = create<LoginStore>()(
  immer((set) => ({
    ...initialState,

    setLoginUrl: (value) =>
      set((state) => {
        state.loginUrl =
          typeof value === 'function' ? value(state.loginUrl) : value
      }),

    setLoading: (loading) =>
      set((state) => {
        state.loading = loading
      }),

    setError: (value) =>
      set((state) => {
        state.error = typeof value === 'function' ? value(state.error) : value
      }),

    setFingerprintHash: (value) =>
      set((state) => {
        state.fingerprintHash =
          typeof value === 'function' ? value(state.fingerprintHash) : value
      }),

    setExpiresAt: (value) =>
      set((state) => {
        state.expiresAt =
          typeof value === 'function' ? value(state.expiresAt) : value
      }),

    setIsWaitingForEnter: (waiting) =>
      set((state) => {
        state.isWaitingForEnter = waiting
      }),

    setHasOpenedBrowser: (opened) =>
      set((state) => {
        state.hasOpenedBrowser = opened
      }),

    setSheenPosition: (value) =>
      set((state) => {
        state.sheenPosition =
          typeof value === 'function' ? value(state.sheenPosition) : value
      }),

    setCopyMessage: (value) =>
      set((state) => {
        state.copyMessage =
          typeof value === 'function' ? value(state.copyMessage) : value
      }),

    setJustCopied: (copied) =>
      set((state) => {
        state.justCopied = copied
      }),

    setHasClickedLink: (clicked) =>
      set((state) => {
        state.hasClickedLink = clicked
      }),

    resetLoginState: () =>
      set((state) => {
        state.loginUrl = initialState.loginUrl
        state.loading = initialState.loading
        state.error = initialState.error
        state.fingerprintHash = initialState.fingerprintHash
        state.expiresAt = initialState.expiresAt
        state.isWaitingForEnter = initialState.isWaitingForEnter
        state.hasOpenedBrowser = initialState.hasOpenedBrowser
        state.sheenPosition = initialState.sheenPosition
        state.copyMessage = initialState.copyMessage
        state.justCopied = initialState.justCopied
        state.hasClickedLink = initialState.hasClickedLink
      }),
  })),
)
