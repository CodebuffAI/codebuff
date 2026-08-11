import { isPlainEnterKey } from './terminal-enter-detection'

import type { KeyEvent } from '@opentui/core'

/**
 * What a keypress means inside the queue editor. Kept separate from the
 * component so the shortcut table is testable without a renderer, matching
 * how chat's own shortcuts are resolved.
 */
export type QueuePanelAction =
  | { type: 'close' }
  | { type: 'cancel-edit' }
  /** Move the cursor by `delta` rows. */
  | { type: 'select'; delta: number }
  /** Move the selected message by `delta` slots. */
  | { type: 'move'; delta: number }
  | { type: 'move-to-top' }
  | { type: 'edit' }
  | { type: 'delete' }
  | { type: 'none' }

export type QueuePanelKeyboardState = {
  /** While an item is open for editing the MultilineInput owns the keyboard;
   *  the panel only listens for the way out. */
  editing: boolean
}

export function resolveQueuePanelAction(
  key: KeyEvent,
  state: QueuePanelKeyboardState,
): QueuePanelAction {
  const isEscape = key.name === 'escape'
  const isCtrlC = key.ctrl && key.name === 'c'

  if (state.editing) {
    if (isEscape || isCtrlC) return { type: 'cancel-edit' }
    return { type: 'none' }
  }

  // `q` covers ctrl+q too, so the shortcut that opened the panel also closes it.
  if (isEscape || isCtrlC || key.name === 'q') return { type: 'close' }

  // Terminals disagree about whether they report modified arrows at all, so
  // reordering also answers to shift+J/K — a plain printable key every
  // terminal delivers.
  const reorder = key.shift || key.ctrl
  if ((key.name === 'up' && reorder) || key.sequence === 'K') {
    return { type: 'move', delta: -1 }
  }
  if ((key.name === 'down' && reorder) || key.sequence === 'J') {
    return { type: 'move', delta: 1 }
  }

  if (key.name === 'up' || key.name === 'k') return { type: 'select', delta: -1 }
  if (key.name === 'down' || key.name === 'j') return { type: 'select', delta: 1 }

  if (key.name === 't') return { type: 'move-to-top' }

  if (key.name === 'e' || isPlainEnterKey(key)) return { type: 'edit' }

  if (
    key.name === 'd' ||
    key.name === 'delete' ||
    (key.name === 'backspace' && !key.ctrl && !key.meta && !key.option)
  ) {
    return { type: 'delete' }
  }

  return { type: 'none' }
}
