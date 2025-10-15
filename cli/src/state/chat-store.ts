import { create } from 'zustand'

import { formatTimestamp } from '../utils/helpers'

import type { ChatMessage } from '../chat'

export type ChatStoreState = {
  messages: ChatMessage[]
  streamingAgents: Set<string>
  collapsedAgents: Set<string>
  focusedAgentId: string | null
  inputValue: string
  inputFocused: boolean
  activeSubagents: Set<string>
  isChainInProgress: boolean
}

type ChatStoreActions = {
  setMessages: (value: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void
  setStreamingAgents: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void
  setCollapsedAgents: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void
  setFocusedAgentId: (value: string | null | ((prev: string | null) => string | null)) => void
  setInputValue: (value: string | ((prev: string) => string)) => void
  setInputFocused: (focused: boolean) => void
  setActiveSubagents: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void
  setIsChainInProgress: (active: boolean) => void
  reset: () => void
}

type ChatStore = ChatStoreState & ChatStoreActions

const initialState: ChatStoreState = {
  messages: [
    {
      id: 'ai-seed-1',
      variant: 'ai',
      content:
        "Hey there! Welcome to the demo — feel free to ask anything or just say hello when you're ready.",
      timestamp: formatTimestamp(),
    },
  ],
  streamingAgents: new Set<string>(),
  collapsedAgents: new Set<string>(),
  focusedAgentId: null,
  inputValue: '',
  inputFocused: true,
  activeSubagents: new Set<string>(),
  isChainInProgress: false,
}

export const useChatStore = create<ChatStore>((set) => ({
  ...initialState,

  setMessages: (value) =>
    set((state) => ({
      messages: typeof value === 'function' ? value(state.messages) : value,
    })),

  setStreamingAgents: (value) =>
    set((state) => ({
      streamingAgents:
        typeof value === 'function' ? value(state.streamingAgents) : value,
    })),

  setCollapsedAgents: (value) =>
    set((state) => ({
      collapsedAgents:
        typeof value === 'function' ? value(state.collapsedAgents) : value,
    })),

  setFocusedAgentId: (value) =>
    set((state) => ({
      focusedAgentId:
        typeof value === 'function' ? value(state.focusedAgentId) : value,
    })),

  setInputValue: (value) =>
    set((state) => ({
      inputValue: typeof value === 'function' ? value(state.inputValue) : value,
    })),

  setInputFocused: (focused) => set({ inputFocused: focused }),

  setActiveSubagents: (value) =>
    set((state) => ({
      activeSubagents:
        typeof value === 'function' ? value(state.activeSubagents) : value,
    })),

  setIsChainInProgress: (active) => set({ isChainInProgress: active }),

  reset: () =>
    set({
      messages: initialState.messages.slice(),
      streamingAgents: new Set(initialState.streamingAgents),
      collapsedAgents: new Set(initialState.collapsedAgents),
      focusedAgentId: initialState.focusedAgentId,
      inputValue: initialState.inputValue,
      inputFocused: initialState.inputFocused,
      activeSubagents: new Set(initialState.activeSubagents),
      isChainInProgress: initialState.isChainInProgress,
    }),
}))

// For backwards compatibility with non-hook usage
export const chatStore = {
  subscribe: useChatStore.subscribe,
  getState: useChatStore.getState,
  setMessages: (value: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) =>
    useChatStore.getState().setMessages(value),
  setStreamingAgents: (value: Set<string> | ((prev: Set<string>) => Set<string>)) =>
    useChatStore.getState().setStreamingAgents(value),
  setCollapsedAgents: (value: Set<string> | ((prev: Set<string>) => Set<string>)) =>
    useChatStore.getState().setCollapsedAgents(value),
  setFocusedAgentId: (value: string | null | ((prev: string | null) => string | null)) =>
    useChatStore.getState().setFocusedAgentId(value),
  setInputValue: (value: string | ((prev: string) => string)) =>
    useChatStore.getState().setInputValue(value),
  setInputFocused: (focused: boolean) => useChatStore.getState().setInputFocused(focused),
  setActiveSubagents: (value: Set<string> | ((prev: Set<string>) => Set<string>)) =>
    useChatStore.getState().setActiveSubagents(value),
  setIsChainInProgress: (active: boolean) =>
    useChatStore.getState().setIsChainInProgress(active),
  reset: () => useChatStore.getState().reset(),
}
