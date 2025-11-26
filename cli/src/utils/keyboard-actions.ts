import type { KeyEvent } from '@opentui/core'
import type { InputMode } from './input-modes'

/**
 * State needed to determine keyboard actions in chat input contexts.
 * This is a focused subset of app state relevant to keyboard handling.
 */
export type ChatKeyboardState = {
  // Input state
  inputMode: InputMode
  inputValue: string
  cursorPosition: number

  // Stream state
  isStreaming: boolean
  isWaitingForResponse: boolean

  // Feedback mode
  feedbackMode: boolean

  // Focus state
  focusedAgentId: string | null

  // Menu state
  slashMenuActive: boolean
  mentionMenuActive: boolean
  slashSelectedIndex: number
  agentSelectedIndex: number
  slashMatchesLength: number
  totalMentionMatches: number
  disableSlashSuggestions: boolean

  // Queue state
  queuePaused: boolean
  queuedCount: number

  // History navigation state
  historyNavUpEnabled: boolean
  historyNavDownEnabled: boolean

  // Exit handler state
  nextCtrlCWillExit: boolean
}

/**
 * All possible keyboard actions for chat input.
 * Each action represents a distinct behavior to be handled.
 */
export type ChatKeyboardAction =
  // Mode actions
  | { type: 'exit-input-mode' }
  | { type: 'exit-feedback-mode' }
  | { type: 'clear-feedback-input' }

  // Input actions
  | { type: 'clear-input' }
  | { type: 'backspace-exit-mode' }

  // Stream actions
  | { type: 'interrupt-stream' }

  // Menu navigation
  | { type: 'slash-menu-down' }
  | { type: 'slash-menu-up' }
  | { type: 'slash-menu-tab' }
  | { type: 'slash-menu-shift-tab' }
  | { type: 'slash-menu-select' }
  | { type: 'mention-menu-down' }
  | { type: 'mention-menu-up' }
  | { type: 'mention-menu-tab' }
  | { type: 'mention-menu-shift-tab' }
  | { type: 'mention-menu-select' }
  | { type: 'open-file-menu-with-tab' }

  // History navigation
  | { type: 'history-up' }
  | { type: 'history-down' }

  // Agent mode
  | { type: 'toggle-agent-mode' }
  | { type: 'unfocus-agent' }

  // Queue actions
  | { type: 'clear-queue' }

  // Exit actions
  | { type: 'exit-app-warning' }
  | { type: 'exit-app' }

  // No action needed
  | { type: 'none' }

const hasModifier = (key: KeyEvent) =>
  Boolean(key.ctrl || key.meta || key.option)

/**
 * Pure function that resolves a keyboard action based on key event and state.
 * This implements the priority-based keyboard handling logic.
 */
export function resolveChatKeyboardAction(
  key: KeyEvent,
  state: ChatKeyboardState,
): ChatKeyboardAction {
  const isEscape = key.name === 'escape'
  const isCtrlC = key.ctrl && key.name === 'c'
  const isBackspace = key.name === 'backspace'
  const isUp = key.name === 'up' && !hasModifier(key)
  const isDown = key.name === 'down' && !hasModifier(key)
  const isTab = key.name === 'tab' && !hasModifier(key)
  const isShiftTab = key.name === 'tab' && key.shift && !key.ctrl && !key.meta && !key.option
  const isEnter = (key.name === 'return' || key.name === 'enter') && !key.shift && !hasModifier(key)

  // Priority 1: Feedback mode handlers
  if (state.feedbackMode) {
    if (isEscape) {
      return { type: 'exit-feedback-mode' }
    }
    if (isCtrlC) {
      return state.inputValue.length === 0
        ? { type: 'exit-feedback-mode' }
        : { type: 'clear-feedback-input' }
    }
  }

  // Priority 2: Non-default input mode escape (THE BUG FIX)
  // Escape should exit the current mode BEFORE interrupting streams
  if (isEscape && state.inputMode !== 'default') {
    return { type: 'exit-input-mode' }
  }

  // Priority 3: Clear input with escape/ctrl-c when there's text
  if ((isEscape || isCtrlC) && state.inputValue.trim().length > 0) {
    return { type: 'clear-input' }
  }

  // Priority 4: Interrupt streaming
  if ((isEscape || isCtrlC) && (state.isStreaming || state.isWaitingForResponse)) {
    return { type: 'interrupt-stream' }
  }

  // Priority 5: Backspace at position 0 exits non-default mode
  if (isBackspace && state.cursorPosition === 0 && state.inputMode !== 'default' && state.inputValue.length === 0) {
    return { type: 'backspace-exit-mode' }
  }

  // Priority 6: Slash menu navigation (when active and not disabled)
  // Skip menu navigation for Up/Down if history navigation is enabled (user is paging through history)
  if (state.slashMenuActive && state.slashMatchesLength > 0 && !state.disableSlashSuggestions) {
    if (isDown) {
      // If user is navigating history (historyNavDownEnabled), skip menu navigation entirely
      if (state.historyNavDownEnabled) {
        // Fall through to history navigation
      } else if (state.slashSelectedIndex < state.slashMatchesLength - 1) {
        return { type: 'slash-menu-down' }
      } else {
        return { type: 'none' } // At bottom, don't navigate
      }
    }
    if (isUp) {
      // If user is navigating history (historyNavUpEnabled), skip menu navigation entirely
      if (state.historyNavUpEnabled) {
        // Fall through to history navigation
      } else if (state.slashSelectedIndex > 0) {
        return { type: 'slash-menu-up' }
      } else {
        return { type: 'none' } // At top, don't navigate
      }
    }
    if (isShiftTab) {
      return { type: 'slash-menu-shift-tab' }
    }
    if (isTab) {
      return state.slashMatchesLength > 1
        ? { type: 'slash-menu-tab' }
        : { type: 'slash-menu-select' }
    }
    if (isEnter) {
      return { type: 'slash-menu-select' }
    }
  }

  // Priority 7: Mention menu navigation (when active)
  // Skip menu navigation for Up/Down if history navigation is enabled (user is paging through history)
  if (state.mentionMenuActive && state.totalMentionMatches > 0) {
    if (isDown) {
      // If user is navigating history (historyNavDownEnabled), skip menu navigation entirely
      if (state.historyNavDownEnabled) {
        // Fall through to history navigation
      } else if (state.agentSelectedIndex < state.totalMentionMatches - 1) {
        return { type: 'mention-menu-down' }
      } else {
        return { type: 'none' } // At bottom, don't navigate
      }
    }
    if (isUp) {
      // If user is navigating history (historyNavUpEnabled), skip menu navigation entirely
      if (state.historyNavUpEnabled) {
        // Fall through to history navigation
      } else if (state.agentSelectedIndex > 0) {
        return { type: 'mention-menu-up' }
      } else {
        return { type: 'none' } // At top, don't navigate
      }
    }
    if (isShiftTab) {
      return { type: 'mention-menu-shift-tab' }
    }
    if (isTab) {
      return state.totalMentionMatches > 1
        ? { type: 'mention-menu-tab' }
        : { type: 'mention-menu-select' }
    }
    if (isEnter) {
      return { type: 'mention-menu-select' }
    }
  }

  // Priority 8: Tab to open file menu (when not in a menu, not shift-tab, and suggestions enabled)
  // This is handled by the hook since it needs to check word at cursor
  if (isTab && !key.shift && !state.mentionMenuActive && !state.slashMenuActive && !state.disableSlashSuggestions) {
    return { type: 'open-file-menu-with-tab' }
  }

  // Priority 9: Queue management
  if (isCtrlC && state.queuePaused && state.queuedCount > 0) {
    return { type: 'clear-queue' }
  }

  // Priority 10: History navigation (when at edges and enabled)
  if (isUp && state.historyNavUpEnabled) {
    return { type: 'history-up' }
  }
  if (isDown && state.historyNavDownEnabled) {
    return { type: 'history-down' }
  }

  // Priority 11: Agent mode toggle (shift-tab when not in menus)
  if (isShiftTab && !state.slashMenuActive && !state.mentionMenuActive) {
    return { type: 'toggle-agent-mode' }
  }

  // Priority 12: Unfocus agent
  if (isEscape && state.focusedAgentId !== null) {
    return { type: 'unfocus-agent' }
  }

  // Priority 13: Exit app (ctrl-c double-tap)
  if (isCtrlC) {
    if (state.nextCtrlCWillExit) {
      return { type: 'exit-app' }
    }
    return { type: 'exit-app-warning' }
  }

  return { type: 'none' }
}

/**
 * Creates default chat keyboard state for initialization.
 */
export function createDefaultChatKeyboardState(): ChatKeyboardState {
  return {
    inputMode: 'default',
    inputValue: '',
    cursorPosition: 0,
    isStreaming: false,
    isWaitingForResponse: false,
    feedbackMode: false,
    focusedAgentId: null,
    slashMenuActive: false,
    mentionMenuActive: false,
    slashSelectedIndex: 0,
    agentSelectedIndex: 0,
    slashMatchesLength: 0,
    totalMentionMatches: 0,
    disableSlashSuggestions: false,
    queuePaused: false,
    queuedCount: 0,
    historyNavUpEnabled: false,
    historyNavDownEnabled: false,
    nextCtrlCWillExit: false,
  }
}
