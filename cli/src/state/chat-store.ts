import { castDraft } from 'immer'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import { AGENT_MODES } from '../utils/constants'
import { clamp } from '../utils/math'
import { loadModePreference, saveModePreference } from '../utils/settings'

import type { ChatMessage, ContentBlock } from '../types/chat'
import type { AgentMode } from '../utils/constants'
import type { InputMode } from '../utils/input-modes'
import type { RunState } from '@codebuff/sdk'

/** Types of banners that can appear at the top of the chat */
export type TopBannerType = 'homeDir' | 'gitRoot' | null

export type InputValue = {
  text: string
  cursorPosition: number
  lastEditDueToNav: boolean
}

export type AskUserQuestion = {
  question: string
  header?: string
  options:
    | string[]
    | Array<{
        label: string
        description?: string
      }>
  multiSelect?: boolean
  validation?: {
    maxLength?: number
    minLength?: number
    pattern?: string
    patternError?: string
  }
}

export type AnswerState = number | number[]

export type AskUserState = {
  toolCallId: string
  questions: AskUserQuestion[]
  selectedAnswers: AnswerState[] // Single-select: number (-1 = not answered), Multi-select: number[]
  otherTexts: string[] // Custom text input for each question (empty string if not used)
} | null

export type PendingImageStatus = 'processing' | 'ready' | 'error'

export type PendingImage = {
  path: string
  filename: string
  status: PendingImageStatus
  size?: number
  width?: number
  height?: number
  note?: string // Display note: "compressed" | error message
  processedImage?: {
    base64: string
    mediaType: string
  }
}

export type PendingBashMessage = {
  id: string
  command: string
  stdout: string
  stderr: string
  exitCode: number
  /** Whether the command is still running */
  isRunning: boolean
  startTime?: number
  cwd?: string
  /** Whether the message was already added to UI chat history (non-ghost mode) */
  addedToHistory?: boolean
}

export type SuggestedFollowup = {
  prompt: string
  label?: string
}

export type SuggestedFollowupsState = {
  /** The tool call ID that created these followups */
  toolCallId: string
  /** The list of followup suggestions */
  followups: SuggestedFollowup[]
  /** Set of indices that have been clicked */
  clickedIndices: Set<number>
}

/** Map of toolCallId -> Set of clicked indices (persists across followup sets) */
export type ClickedFollowupsMap = Map<string, Set<number>>

export type ChatStoreState = {
  messages: ChatMessage[]
  streamingAgents: Set<string>
  focusedAgentId: string | null
  inputValue: string
  cursorPosition: number
  lastEditDueToNav: boolean
  inputFocused: boolean
  isFocusSupported: boolean
  activeSubagents: Set<string>
  isChainInProgress: boolean
  slashSelectedIndex: number
  agentSelectedIndex: number
  agentMode: AgentMode
  hasReceivedPlanResponse: boolean
  lastMessageMode: AgentMode | null
  sessionCreditsUsed: number
  runState: RunState | null
  /** The currently active top banner, or null if none */
  activeTopBanner: TopBannerType
  inputMode: InputMode
  isRetrying: boolean
  showChatPicker: boolean
  askUserState: AskUserState
  pendingImages: PendingImage[]
  pendingBashMessages: PendingBashMessage[]
  suggestedFollowups: SuggestedFollowupsState | null
  /** Persisted clicked indices per toolCallId */
  clickedFollowupsMap: ClickedFollowupsMap
}

const findLatestFollowupInBlocks = (
  blocks: ContentBlock[] | undefined,
): string | null => {
  if (!blocks) return null

  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]
    if (block.type === 'tool' && block.toolName === 'suggest_followups') {
      return block.toolCallId
    }
    if (block.type === 'agent') {
      const nested = findLatestFollowupInBlocks(block.blocks)
      if (nested) return nested
    }
  }

  return null
}

export const getLatestFollowupToolCallId = (
  messages: ChatMessage[],
): string | null => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const latest = findLatestFollowupInBlocks(messages[i]?.blocks)
    if (latest) return latest
  }
  return null
}

type ChatStoreActions = {
  setMessages: (
    value: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void
  setStreamingAgents: (
    value: Set<string> | ((prev: Set<string>) => Set<string>),
  ) => void
  setFocusedAgentId: (
    value: string | null | ((prev: string | null) => string | null),
  ) => void
  setInputValue: (
    value: InputValue | ((prev: InputValue) => InputValue),
  ) => void
  setInputFocused: (focused: boolean) => void
  setIsFocusSupported: (supported: boolean) => void
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
  setRunState: (runState: RunState | null) => void
  setActiveTopBanner: (banner: TopBannerType) => void
  closeTopBanner: () => void
  setInputMode: (mode: InputMode) => void
  setIsRetrying: (retrying: boolean) => void
  setShowChatPicker: (show: boolean) => void
  setAskUserState: (state: AskUserState) => void
  updateAskUserAnswer: (questionIndex: number, optionIndex: number) => void
  updateAskUserOtherText: (questionIndex: number, text: string) => void
  addPendingImage: (image: PendingImage) => void
  removePendingImage: (path: string) => void
  clearPendingImages: () => void
  addPendingBashMessage: (message: PendingBashMessage) => void
  updatePendingBashMessage: (
    id: string,
    updates: Partial<PendingBashMessage>,
  ) => void
  removePendingBashMessage: (id: string) => void
  clearPendingBashMessages: () => void
  setSuggestedFollowups: (state: SuggestedFollowupsState | null) => void
  markFollowupClicked: (toolCallId: string, index: number) => void
  reset: () => void
}

type ChatStore = ChatStoreState & ChatStoreActions

const initialState: ChatStoreState = {
  messages: [],
  streamingAgents: new Set<string>(),
  focusedAgentId: null,
  inputValue: '',
  cursorPosition: 0,
  lastEditDueToNav: false,
  inputFocused: true, // Cursor visible by default
  isFocusSupported: false, // Don't blink until terminal support is detected
  activeSubagents: new Set<string>(),
  isChainInProgress: false,
  slashSelectedIndex: 0,
  agentSelectedIndex: 0,
  agentMode: loadModePreference(),
  hasReceivedPlanResponse: false,
  lastMessageMode: null,
  sessionCreditsUsed: 0,
  runState: null,
  activeTopBanner: null,
  inputMode: 'default' as InputMode,
  isRetrying: false,
  showChatPicker: false,
  askUserState: null,
  pendingImages: [],
  pendingBashMessages: [],
  suggestedFollowups: null,
  clickedFollowupsMap: new Map<string, Set<number>>(),
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

    setIsFocusSupported: (supported) =>
      set((state) => {
        state.isFocusSupported = supported
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
        saveModePreference(mode)
      }),

    toggleAgentMode: () =>
      set((state) => {
        const currentIndex = AGENT_MODES.indexOf(state.agentMode)
        const nextIndex = (currentIndex + 1) % AGENT_MODES.length
        state.agentMode = AGENT_MODES[nextIndex]
        saveModePreference(state.agentMode)
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

    setActiveTopBanner: (banner) =>
      set((state) => {
        state.activeTopBanner = banner
      }),

    closeTopBanner: () =>
      set((state) => {
        state.activeTopBanner = null
      }),

    setInputMode: (mode) =>
      set((state) => {
        state.inputMode = mode
      }),

    setIsRetrying: (retrying) =>
      set((state) => {
        state.isRetrying = retrying
      }),

    setShowChatPicker: (show) =>
      set((state) => {
        state.showChatPicker = show
      }),

    setAskUserState: (askUserState) =>
      set((state) => {
        state.askUserState = askUserState
      }),

    addPendingImage: (image) =>
      set((state) => {
        // Don't add duplicates
        if (!state.pendingImages.some((i) => i.path === image.path)) {
          state.pendingImages.push(image)
        }
      }),

    removePendingImage: (path) =>
      set((state) => {
        state.pendingImages = state.pendingImages.filter((i) => i.path !== path)
      }),

    clearPendingImages: () =>
      set((state) => {
        state.pendingImages = []
      }),

    updateAskUserAnswer: (questionIndex, optionIndex) =>
      set((state) => {
        if (!state.askUserState) return

        const question = state.askUserState.questions[questionIndex]
        const currentAnswer = state.askUserState.selectedAnswers[questionIndex]

        if (question?.multiSelect) {
          // Multi-select: toggle option in array
          const selected = Array.isArray(currentAnswer) ? currentAnswer : []
          const newSelected = selected.includes(optionIndex)
            ? selected.filter((i) => i !== optionIndex) // Remove if already selected
            : [...selected, optionIndex] // Add if not selected

          state.askUserState.selectedAnswers[questionIndex] = newSelected
        } else {
          // Single-select: set option index
          state.askUserState.selectedAnswers[questionIndex] = optionIndex
        }

        // Clear other text when any option is selected (mutually exclusive)
        state.askUserState.otherTexts[questionIndex] = ''
      }),

    updateAskUserOtherText: (questionIndex, text) =>
      set((state) => {
        if (!state.askUserState) return

        state.askUserState.otherTexts[questionIndex] = text

        // Clear selected option(s) when text is entered (mutually exclusive)
        if (text) {
          const question = state.askUserState.questions[questionIndex]
          if (question?.multiSelect) {
            state.askUserState.selectedAnswers[questionIndex] = []
          } else {
            state.askUserState.selectedAnswers[questionIndex] = -1
          }
        }
      }),

    addPendingBashMessage: (message) =>
      set((state) => {
        state.pendingBashMessages.push(message)
      }),

    updatePendingBashMessage: (id, updates) =>
      set((state) => {
        const msg = state.pendingBashMessages.find((m) => m.id === id)
        if (msg) {
          Object.assign(msg, updates)
        }
      }),

    removePendingBashMessage: (id) =>
      set((state) => {
        state.pendingBashMessages = state.pendingBashMessages.filter(
          (m) => m.id !== id,
        )
      }),

    clearPendingBashMessages: () =>
      set((state) => {
        state.pendingBashMessages = []
      }),

    setSuggestedFollowups: (suggestedFollowups) =>
      set((state) => {
        state.suggestedFollowups = suggestedFollowups
      }),

    markFollowupClicked: (toolCallId: string, index: number) =>
      set((state) => {
        // Store in the persistent map
        if (!state.clickedFollowupsMap.has(toolCallId)) {
          state.clickedFollowupsMap.set(toolCallId, new Set<number>())
        }
        state.clickedFollowupsMap.get(toolCallId)!.add(index)

        // Also update the current suggestedFollowups if it matches
        if (state.suggestedFollowups?.toolCallId === toolCallId) {
          state.suggestedFollowups.clickedIndices.add(index)
        }
      }),

    reset: () =>
      set((state) => {
        state.messages = initialState.messages.slice()
        state.streamingAgents = new Set(initialState.streamingAgents)
        state.focusedAgentId = initialState.focusedAgentId
        state.inputValue = initialState.inputValue
        state.cursorPosition = initialState.cursorPosition
        state.lastEditDueToNav = initialState.lastEditDueToNav
        state.inputFocused = initialState.inputFocused
        state.isFocusSupported = initialState.isFocusSupported
        state.activeSubagents = new Set(initialState.activeSubagents)
        state.isChainInProgress = initialState.isChainInProgress
        state.slashSelectedIndex = initialState.slashSelectedIndex
        state.agentSelectedIndex = initialState.agentSelectedIndex
        state.agentMode = initialState.agentMode
        state.hasReceivedPlanResponse = initialState.hasReceivedPlanResponse
        state.lastMessageMode = initialState.lastMessageMode
        state.sessionCreditsUsed = initialState.sessionCreditsUsed
        state.runState = initialState.runState
          ? castDraft(initialState.runState)
          : null
        state.activeTopBanner = initialState.activeTopBanner
        state.inputMode = initialState.inputMode
        state.isRetrying = initialState.isRetrying
        state.askUserState = initialState.askUserState
        state.pendingImages = []
        state.pendingBashMessages = []
        state.suggestedFollowups = null
        state.clickedFollowupsMap = new Map<string, Set<number>>()
      }),
  })),
)
