import { useCallback, useRef, useSyncExternalStore } from 'react'

import { formatTimestamp } from '../utils/helpers'

import type { ChatMessage } from '../chat'

type Listener = () => void

type StateSetter<T> = (value: T | ((prev: T) => T)) => void

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
  setMessages: StateSetter<ChatMessage[]>
  setStreamingAgents: StateSetter<Set<string>>
  setCollapsedAgents: StateSetter<Set<string>>
  setFocusedAgentId: StateSetter<string | null>
  setInputValue: StateSetter<string>
  setInputFocused: (focused: boolean) => void
  setActiveSubagents: StateSetter<Set<string>>
  setIsChainInProgress: (active: boolean) => void
  reset: () => void
}

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

let state: ChatStoreState = initialState
const listeners = new Set<Listener>()

const notify = (): void => {
  for (const listener of listeners) {
    listener()
  }
}

const resolveState = <T>(
  update: T | ((prev: T) => T),
  prev: T,
): T => {
  if (typeof update === 'function') {
    return (update as (value: T) => T)(prev)
  }
  return update
}

const assignState = (next: ChatStoreState): void => {
  state = next
  notify()
}

const setPartialState = (
  updater: (current: ChatStoreState) => ChatStoreState,
): void => {
  const next = updater(state)
  if (next === state) {
    return
  }
  assignState(next)
}

const actions: ChatStoreActions = {
  setMessages: (update) => {
    setPartialState((current) => {
      const nextMessages = resolveState(update, current.messages)
      if (nextMessages === current.messages) {
        return current
      }
      return { ...current, messages: nextMessages }
    })
  },
  setStreamingAgents: (update) => {
    setPartialState((current) => {
      const nextAgents = resolveState(update, current.streamingAgents)
      if (nextAgents === current.streamingAgents) {
        return current
      }
      return { ...current, streamingAgents: nextAgents }
    })
  },
  setCollapsedAgents: (update) => {
    setPartialState((current) => {
      const nextCollapsed = resolveState(update, current.collapsedAgents)
      if (nextCollapsed === current.collapsedAgents) {
        return current
      }
      return { ...current, collapsedAgents: nextCollapsed }
    })
  },
  setFocusedAgentId: (update) => {
    setPartialState((current) => {
      const nextFocused = resolveState(update, current.focusedAgentId)
      if (current.focusedAgentId === nextFocused) {
        return current
      }
      return { ...current, focusedAgentId: nextFocused }
    })
  },
  setInputValue: (update) => {
    setPartialState((current) => {
      const nextValue = resolveState(update, current.inputValue)
      if (nextValue === current.inputValue) {
        return current
      }
      return { ...current, inputValue: nextValue }
    })
  },
  setInputFocused: (focused) => {
    setPartialState((current) => {
      if (current.inputFocused === focused) {
        return current
      }
      return { ...current, inputFocused: focused }
    })
  },
  setActiveSubagents: (update) => {
    setPartialState((current) => {
      const nextSubagents = resolveState(update, current.activeSubagents)
      if (nextSubagents === current.activeSubagents) {
        return current
      }
      return { ...current, activeSubagents: nextSubagents }
    })
  },
  setIsChainInProgress: (active) => {
    setPartialState((current) => {
      if (current.isChainInProgress === active) {
        return current
      }
      return { ...current, isChainInProgress: active }
    })
  },
  reset: () => {
    assignState({
      messages: initialState.messages.slice(),
      streamingAgents: new Set(initialState.streamingAgents),
      collapsedAgents: new Set(initialState.collapsedAgents),
      focusedAgentId: initialState.focusedAgentId,
      inputValue: initialState.inputValue,
      inputFocused: initialState.inputFocused,
      activeSubagents: new Set(initialState.activeSubagents),
      isChainInProgress: initialState.isChainInProgress,
    })
  },
}

export const chatStore = {
  subscribe(listener: Listener): (() => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  getState(): ChatStoreState {
    return state
  },
  ...actions,
}

type ChatStoreSnapshot = ChatStoreState & ChatStoreActions

const getSnapshot = (): ChatStoreSnapshot => ({
  ...state,
  ...actions,
})

export const useChatStore = <T>(
  selector: (snapshot: ChatStoreSnapshot) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T => {
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  const lastSelectionRef = useRef<T>()

  const getSelectedSnapshot = useCallback(() => {
    const selection = selectorRef.current(getSnapshot())
    const last = lastSelectionRef.current
    if (last !== undefined && isEqual(selection, last)) {
      return last
    }
    lastSelectionRef.current = selection
    return selection
  }, [isEqual])

  return useSyncExternalStore(
    chatStore.subscribe,
    getSelectedSnapshot,
    getSelectedSnapshot,
  )
}
