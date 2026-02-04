import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface ReviewState {
  reviewMode: boolean
  customText: string
  customCursor: number
  openReviewScreen: () => void
  closeReviewScreen: () => void
  setCustomText: (text: string) => void
  setCustomCursor: (cursor: number) => void
}

export const useReviewStore = create<ReviewState>()(
  immer((set) => ({
    reviewMode: false,
    customText: '',
    customCursor: 0,
    openReviewScreen: () => {
      set((state) => {
        state.reviewMode = true
      })
    },
    closeReviewScreen: () => {
      set((state) => {
        state.reviewMode = false
        state.customText = ''
        state.customCursor = 0
      })
    },
    setCustomText: (text: string) => {
      set((state) => {
        state.customText = text
      })
    },
    setCustomCursor: (cursor: number) => {
      set((state) => {
        state.customCursor = cursor
      })
    },
  })),
)
