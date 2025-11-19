import { castDraft } from 'immer'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import { clamp } from '../utils/math'

import type { RunState } from '@codebuff/sdk'
import type { ChatMessage } from '../types/chat'
import type { AgentMode } from '../utils/constants'

export type InputValue = {
  text: string
  cursorPosition: number
  lastEditDueToNav: boolean
}

export type ChatStoreState = {
  messages: ChatMessage[]
  inputValue: string
  cursorPosition: number
  lastEditDueToNav: boolean
  slashSelectedIndex: number
  agentSelectedIndex: number
  agentMode: AgentMode
  hasReceivedPlanResponse: boolean
  lastMessageMode: AgentMode | null
  sessionCreditsUsed: number
  runState: RunState | null
}

type ChatStoreActions = {
  setMessages: (
    value: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void
  setInputValue: (
    value: InputValue | ((prev: InputValue) => InputValue),
  ) => void
  setSlashSelectedIndex: (value: number | ((prev: number) => number)) => void
  setAgentSelectedIndex: (value: number | ((prev: number) => number)) => void
  setAgentMode: (mode: AgentMode) => void
  toggleAgentMode: () => void
  setHasReceivedPlanResponse: (value: boolean) => void
  setLastMessageMode: (mode: AgentMode | null) => void
  addSessionCredits: (credits: number) => void
  setRunState: (runState: RunState | null) => void
  reset: () => void
}

type ChatStore = ChatStoreState & ChatStoreActions

const initialState: ChatStoreState = {
  messages: [],
  inputValue: '',
  cursorPosition: 0,
  lastEditDueToNav: false,
  slashSelectedIndex: 0,
  agentSelectedIndex: 0,
  agentMode: 'DEFAULT',
  hasReceivedPlanResponse: false,
  lastMessageMode: null,
  sessionCreditsUsed: 0,
  runState: null,
}

export const useChatStore = create<ChatStore>()(
  immer((set) => ({
    ...initialState,

    setMessages: (value) =>
      set((state) => {
        state.messages =
          typeof value === 'function' ? value(state.messages) : value
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

    setRunState: (runState) =>
      set((state) => {
        state.runState = runState ? castDraft(runState) : null
      }),

    reset: () =>
      set((state) => {
        state.messages = initialState.messages.slice()
        state.inputValue = initialState.inputValue
        state.cursorPosition = initialState.cursorPosition
        state.lastEditDueToNav = initialState.lastEditDueToNav
        state.slashSelectedIndex = initialState.slashSelectedIndex
        state.agentSelectedIndex = initialState.agentSelectedIndex
        state.agentMode = initialState.agentMode
        state.hasReceivedPlanResponse = initialState.hasReceivedPlanResponse
        state.lastMessageMode = initialState.lastMessageMode
        state.sessionCreditsUsed = initialState.sessionCreditsUsed
        state.runState = initialState.runState
          ? castDraft(initialState.runState)
          : null
      }),
  })),
)
