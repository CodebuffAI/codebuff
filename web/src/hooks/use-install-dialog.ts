'use client'

import { create } from 'zustand'

interface InstallDialogStore {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

export const useInstallDialog = create<InstallDialogStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}))