import { useCallback } from 'react'
import { useKeyboard } from '@opentui/react'
import type { KeyEvent } from '@opentui/core'

import {
  resolveChatKeyboardAction,
  type ChatKeyboardState,
  type ChatKeyboardAction,
} from '../utils/keyboard-actions'

/**
 * Handlers for chat keyboard actions.
 * Each handler corresponds to a ChatKeyboardAction type.
 */
export type ChatKeyboardHandlers = {
  // Mode handlers
  onExitInputMode: () => void
  onExitFeedbackMode: () => void
  onClearFeedbackInput: () => void

  // Input handlers
  onClearInput: () => void
  onBackspaceExitMode: () => void

  // Stream handlers
  onInterruptStream: () => void

  // Slash menu handlers
  onSlashMenuDown: () => void
  onSlashMenuUp: () => void
  onSlashMenuTab: () => void
  onSlashMenuShiftTab: () => void
  onSlashMenuSelect: () => void

  // Mention menu handlers
  onMentionMenuDown: () => void
  onMentionMenuUp: () => void
  onMentionMenuTab: () => void
  onMentionMenuShiftTab: () => void
  onMentionMenuSelect: () => void

  // File menu handler
  onOpenFileMenuWithTab: () => boolean // Returns true if menu was opened

  // History handlers
  onHistoryUp: () => void
  onHistoryDown: () => void

  // Agent handlers
  onToggleAgentMode: () => void
  onUnfocusAgent: () => void

  // Queue handlers
  onClearQueue: () => void

  // Exit handlers
  onExitAppWarning: () => void
  onExitApp: () => void
}

/**
 * Options for the useChatKeyboard hook.
 */
export type UseChatKeyboardOptions = {
  /** Current keyboard state extracted from stores */
  state: ChatKeyboardState
  /** Handlers for keyboard actions */
  handlers: ChatKeyboardHandlers
  /** Whether keyboard handling is disabled (e.g., during ask-user) */
  disabled?: boolean
}

/**
 * Dispatches a keyboard action to the appropriate handler.
 */
function assertNever(action: never): never {
  throw new Error(`Unhandled chat keyboard action: ${String(action)}`)
}

function dispatchAction(
  action: ChatKeyboardAction,
  handlers: ChatKeyboardHandlers,
): boolean {
  switch (action.type) {
    case 'exit-input-mode':
      handlers.onExitInputMode()
      return true
    case 'exit-feedback-mode':
      handlers.onExitFeedbackMode()
      return true
    case 'clear-feedback-input':
      handlers.onClearFeedbackInput()
      return true
    case 'clear-input':
      handlers.onClearInput()
      return true
    case 'backspace-exit-mode':
      handlers.onBackspaceExitMode()
      return true
    case 'interrupt-stream':
      handlers.onInterruptStream()
      return true
    case 'slash-menu-down':
      handlers.onSlashMenuDown()
      return true
    case 'slash-menu-up':
      handlers.onSlashMenuUp()
      return true
    case 'slash-menu-tab':
      handlers.onSlashMenuTab()
      return true
    case 'slash-menu-shift-tab':
      handlers.onSlashMenuShiftTab()
      return true
    case 'slash-menu-select':
      handlers.onSlashMenuSelect()
      return true
    case 'mention-menu-down':
      handlers.onMentionMenuDown()
      return true
    case 'mention-menu-up':
      handlers.onMentionMenuUp()
      return true
    case 'mention-menu-tab':
      handlers.onMentionMenuTab()
      return true
    case 'mention-menu-shift-tab':
      handlers.onMentionMenuShiftTab()
      return true
    case 'mention-menu-select':
      handlers.onMentionMenuSelect()
      return true
    case 'open-file-menu-with-tab':
      return handlers.onOpenFileMenuWithTab()
    case 'history-up':
      handlers.onHistoryUp()
      return true
    case 'history-down':
      handlers.onHistoryDown()
      return true
    case 'toggle-agent-mode':
      handlers.onToggleAgentMode()
      return true
    case 'unfocus-agent':
      handlers.onUnfocusAgent()
      return true
    case 'clear-queue':
      handlers.onClearQueue()
      return true
    case 'exit-app-warning':
      handlers.onExitAppWarning()
      return true
    case 'exit-app':
      handlers.onExitApp()
      return true
    case 'none':
      return false
  }

  return assertNever(action)
}

/**
 * Hook for handling keyboard input in chat text input contexts.
 * Integrates priority-based action resolution with handlers.
 *
 * This hook handles:
 * - Mode switching (bash, referral, etc.)
 * - Stream interruption
 * - Suggestion menu navigation (slash and mention menus)
 * - History navigation
 * - Agent mode toggle
 * - Exit handling
 *
 * For feedback mode, the hook respects the feedbackMode state and routes
 * escape/ctrl-c appropriately.
 */
export function useChatKeyboard({
  state,
  handlers,
  disabled = false,
}: UseChatKeyboardOptions): void {
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (disabled) return

        const action = resolveChatKeyboardAction(key, state)
        const handled = dispatchAction(action, handlers)

        // Prevent default for handled actions
        if (
          handled &&
          'preventDefault' in key &&
          typeof key.preventDefault === 'function'
        ) {
          key.preventDefault()
        }
      },
      [state, handlers, disabled],
    ),
  )
}
