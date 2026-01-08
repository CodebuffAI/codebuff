import { create } from 'zustand'

interface ChatHistoryStoreState {
  showChatHistory: boolean
}

interface ChatHistoryStoreActions {
  openChatHistory: () => void
  closeChatHistory: () => void
  reset: () => void
}

type ChatHistoryStore = ChatHistoryStoreState & ChatHistoryStoreActions

const initialState: ChatHistoryStoreState = {
  showChatHistory: false,
}

export const useChatHistoryStore = create<ChatHistoryStore>()((set) => ({
  ...initialState,

  openChatHistory: () =>
    set({ showChatHistory: true }),

  closeChatHistory: () =>
    set({ showChatHistory: false }),

  reset: () =>
    set(initialState),
}))
