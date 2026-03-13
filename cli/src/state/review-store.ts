import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface ReviewState {
  reviewMode: boolean
  openReviewScreen: () => void
  closeReviewScreen: () => void
}

export const useReviewStore = create<ReviewState>()(
  immer((set) => ({
    reviewMode: false,
    openReviewScreen: () => {
      set((state) => {
        state.reviewMode = true
      })
    },
    closeReviewScreen: () => {
      set((state) => {
        state.reviewMode = false
      })
    },
  })),
)
