import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import type { User } from '../utils/auth'

export type AuthStoreState = {
  isAuthenticated: boolean | null
  user: User | null
}

export type AuthStoreActions = {
  setIsAuthenticated: (value: boolean | null) => void
  setUser: (value: User | null) => void
  resetAuth: () => void
}

export type AuthStore = AuthStoreState & AuthStoreActions

const initialState: AuthStoreState = {
  isAuthenticated: null,
  user: null,
}

export const useAuthStore = create<AuthStore>()(
  immer((set) => ({
    ...initialState,

    setIsAuthenticated: (value) =>
      set((state) => {
        state.isAuthenticated = value
      }),

    setUser: (value) =>
      set((state) => {
        state.user = value
      }),

    resetAuth: () =>
      set((state) => {
        state.isAuthenticated = initialState.isAuthenticated
        state.user = initialState.user
      }),
  })),
)
