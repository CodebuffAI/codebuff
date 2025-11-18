import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface FeedbackState {
  feedbackMessageId: string | null
  feedbackMode: boolean
  feedbackText: string
  feedbackCursor: number
  feedbackCategory: string
  savedInputValue: string
  savedCursorPosition: number
  messagesWithFeedback: Set<string>
  messageFeedbackCategories: Map<string, string>
}

interface FeedbackActions {
  openFeedbackForMessage: (messageId: string | null) => void
  closeFeedback: () => void
  setFeedbackText: (text: string) => void
  setFeedbackCursor: (cursor: number) => void
  setFeedbackCategory: (category: string) => void
  saveCurrentInput: (value: string, cursor: number) => void
  restoreSavedInput: () => { value: string; cursor: number }
  markMessageFeedbackSubmitted: (messageId: string, category: string) => void
  resetFeedbackForm: () => void
  reset: () => void
}

type FeedbackStore = FeedbackState & FeedbackActions

const initialState: FeedbackState = {
  feedbackMessageId: null,
  feedbackMode: false,
  feedbackText: '',
  feedbackCursor: 0,
  feedbackCategory: 'other',
  savedInputValue: '',
  savedCursorPosition: 0,
  messagesWithFeedback: new Set(),
  messageFeedbackCategories: new Map(),
}

export const useFeedbackStore = create<FeedbackStore>()(
  immer((set, get) => ({
    ...initialState,

    openFeedbackForMessage: (messageId) =>
      set((state) => {
        state.feedbackMessageId = messageId
        state.feedbackMode = true
        state.feedbackText = ''
        state.feedbackCursor = 0
        state.feedbackCategory = 'other'
      }),

    closeFeedback: () =>
      set((state) => {
        state.feedbackMode = false
        state.feedbackMessageId = null
      }),

    setFeedbackText: (text) =>
      set((state) => {
        state.feedbackText = text
      }),

    setFeedbackCursor: (cursor) =>
      set((state) => {
        state.feedbackCursor = cursor
      }),

    setFeedbackCategory: (category) =>
      set((state) => {
        state.feedbackCategory = category
      }),

    saveCurrentInput: (value, cursor) =>
      set((state) => {
        state.savedInputValue = value
        state.savedCursorPosition = cursor
      }),

    restoreSavedInput: () => {
      const state = get()
      return {
        value: state.savedInputValue,
        cursor: state.savedCursorPosition,
      }
    },

    markMessageFeedbackSubmitted: (messageId, category) =>
      set((state) => {
        state.messagesWithFeedback.add(messageId)
        state.messageFeedbackCategories.set(messageId, category)
      }),

    resetFeedbackForm: () =>
      set((state) => {
        state.feedbackText = ''
        state.feedbackCursor = 0
        state.feedbackCategory = 'other'
        state.feedbackMessageId = null
      }),

    reset: () =>
      set(() => ({
        ...initialState,
        messagesWithFeedback: new Set(),
        messageFeedbackCategories: new Map(),
      })),
  }))
)

export const selectIsFeedbackOpen = (state: FeedbackStore) => state.feedbackMode
export const selectFeedbackMessageId = (state: FeedbackStore) => state.feedbackMessageId
export const selectIsFeedbackOpenForMessage = (messageId: string) => (state: FeedbackStore) =>
  state.feedbackMode && state.feedbackMessageId === messageId
export const selectHasSubmittedFeedback = (messageId: string) => (state: FeedbackStore) =>
  state.messagesWithFeedback.has(messageId)
export const selectMessageFeedbackCategory = (messageId: string) => (state: FeedbackStore) =>
  state.messageFeedbackCategories.get(messageId)
