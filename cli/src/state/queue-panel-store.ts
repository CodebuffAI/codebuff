import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface QueuePanelState {
  /** The queue editor takes the composer's place while open, the way the
   *  review screen does — the queue is what the user is typing about. */
  queuePanelOpen: boolean
  openQueuePanel: () => void
  closeQueuePanel: () => void
}

export const useQueuePanelStore = create<QueuePanelState>()(
  immer((set) => ({
    queuePanelOpen: false,
    openQueuePanel: () => {
      set((state) => {
        state.queuePanelOpen = true
      })
    },
    closeQueuePanel: () => {
      set((state) => {
        state.queuePanelOpen = false
      })
    },
  })),
)
