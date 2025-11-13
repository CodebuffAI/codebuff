import { enableMapSet } from 'immer'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import { clamp } from '../utils/math'

import type { ChatMessage } from '../types/chat'
import type { AgentMode } from '../utils/constants'

export type InputValue = {
  text: string
  cursorPosition: number
  lastEditDueToNav: boolean
}

export type ChatStoreState = {
  messages: ChatMessage[]
  streamingAgents: Set<string>
  collapsedAgents: Set<string>
  focusedAgentId: string | null
  inputValue: string
  cursorPosition: number
  lastEditDueToNav: boolean
  inputFocused: boolean
  activeSubagents: Set<string>
  isChainInProgress: boolean
  slashSelectedIndex: number
  agentSelectedIndex: number
  agentMode: AgentMode
  hasReceivedPlanResponse: boolean
  lastMessageMode: AgentMode | null
  sessionCreditsUsed: number
  previousRunState: any
}

type ChatStoreActions = {
  setMessages: (
    value: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void
  setStreamingAgents: (
    value: Set<string> | ((prev: Set<string>) => Set<string>),
  ) => void
  setCollapsedAgents: (
    value: Set<string> | ((prev: Set<string>) => Set<string>),
  ) => void
  setFocusedAgentId: (
    value: string | null | ((prev: string | null) => string | null),
  ) => void
  setInputValue: (
    value: InputValue | ((prev: InputValue) => InputValue),
  ) => void
  setInputFocused: (focused: boolean) => void
  setActiveSubagents: (
    value: Set<string> | ((prev: Set<string>) => Set<string>),
  ) => void
  setIsChainInProgress: (active: boolean) => void
  setSlashSelectedIndex: (value: number | ((prev: number) => number)) => void
  setAgentSelectedIndex: (value: number | ((prev: number) => number)) => void
  setAgentMode: (mode: AgentMode) => void
  toggleAgentMode: () => void
  setHasReceivedPlanResponse: (value: boolean) => void
  setLastMessageMode: (mode: AgentMode | null) => void
  addSessionCredits: (credits: number) => void
  setPreviousRunState: (runState: any) => void
  reset: () => void
}

type ChatStore = ChatStoreState & ChatStoreActions

enableMapSet()

const initialState: ChatStoreState = {
  messages: [],
  streamingAgents: new Set<string>(),
  collapsedAgents: new Set<string>(),
  focusedAgentId: null,
  inputValue: '',
  cursorPosition: 0,
  lastEditDueToNav: false,
  inputFocused: true,
  activeSubagents: new Set<string>(),
  isChainInProgress: false,
  slashSelectedIndex: 0,
  agentSelectedIndex: 0,
  agentMode: 'DEFAULT',
  hasReceivedPlanResponse: false,
  lastMessageMode: null,
  sessionCreditsUsed: 0,
  previousRunState: null,
}

export const useChatStore = create<ChatStore>()(
  immer((set) => ({
    ...initialState,

    setMessages: (value) =>
      set((state) => {
        state.messages =
          typeof value === 'function' ? value(state.messages) : value
      }),

    setStreamingAgents: (value) =>
      set((state) => {
        state.streamingAgents =
          typeof value === 'function' ? value(state.streamingAgents) : value
      }),

    setCollapsedAgents: (value) =>
      set((state) => {
        state.collapsedAgents =
          typeof value === 'function' ? value(state.collapsedAgents) : value
      }),

    setFocusedAgentId: (value) =>
      set((state) => {
        state.focusedAgentId =
          typeof value === 'function' ? value(state.focusedAgentId) : value
      }),

    setInputValue: (value) =>
      set((state) => {
        const { text, cursorPosition, lastEditDueToNav } =
          typeof value === 'function'
            ? value({
                text: state.inputValue,
                cursorPosition: state.cursorPosition,
                lastEditDueToNav: state.lastEditDueToNav,
              })
            : value
        state.inputValue = text
        state.cursorPosition = clamp(cursorPosition, 0, text.length)
        state.lastEditDueToNav = lastEditDueToNav
      }),

    setInputFocused: (focused) =>
      set((state) => {
        state.inputFocused = focused
      }),

    setActiveSubagents: (value) =>
      set((state) => {
        state.activeSubagents =
          typeof value === 'function' ? value(state.activeSubagents) : value
      }),

    setIsChainInProgress: (active) =>
      set((state) => {
        state.isChainInProgress = active
      }),

    setSlashSelectedIndex: (value) =>
      set((state) => {
        state.slashSelectedIndex =
          typeof value === 'function' ? value(state.slashSelectedIndex) : value
      }),

    setAgentSelectedIndex: (value) =>
      set((state) => {
        state.agentSelectedIndex =
          typeof value === 'function' ? value(state.agentSelectedIndex) : value
      }),

    setAgentMode: (mode) =>
      set((state) => {
        state.agentMode = mode
      }),

    toggleAgentMode: () =>
      set((state) => {
        if (state.agentMode === 'DEFAULT') {
          state.agentMode = 'MAX'
        } else if (state.agentMode === 'MAX') {
          state.agentMode = 'PLAN'
        } else {
          state.agentMode = 'DEFAULT'
        }
      }),

    setHasReceivedPlanResponse: (value) =>
      set((state) => {
        state.hasReceivedPlanResponse = value
      }),

    setLastMessageMode: (mode) =>
      set((state) => {
        state.lastMessageMode = mode
      }),

    addSessionCredits: (credits) =>
      set((state) => {
        state.sessionCreditsUsed += credits
      }),
    setPreviousRunState: (runState) =>
      set(
        (state) => {
          // Cast to any to bypass Immer's WritableDraft type checking
          // RunState contains complex nested types that Immer can't handle
          ;(state as any).previousRunState = runState
        },
        false, // Don't replace state, just mutate
      ),

    reset: () =>
      set((state) => {
        state.messages = initialState.messages.slice()
        state.streamingAgents = new Set(initialState.streamingAgents)
        state.collapsedAgents = new Set(initialState.collapsedAgents)
        state.focusedAgentId = initialState.focusedAgentId
        state.inputValue = initialState.inputValue
        state.cursorPosition = initialState.cursorPosition
        state.lastEditDueToNav = initialState.lastEditDueToNav
        state.inputFocused = initialState.inputFocused
        state.activeSubagents = new Set(initialState.activeSubagents)
        state.isChainInProgress = initialState.isChainInProgress
        state.slashSelectedIndex = initialState.slashSelectedIndex
        state.agentSelectedIndex = initialState.agentSelectedIndex
        state.agentMode = initialState.agentMode
        state.hasReceivedPlanResponse = initialState.hasReceivedPlanResponse
        state.lastMessageMode = initialState.lastMessageMode
        state.sessionCreditsUsed = initialState.sessionCreditsUsed
        state.previousRunState = initialState.previousRunState
      }),
  })),
)
