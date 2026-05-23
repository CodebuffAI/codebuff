import { isPlainEnterKey } from './terminal-enter-detection'

type ChatInputKey = {
  name?: string
  sequence?: string
  shift?: boolean
  ctrl?: boolean
  meta?: boolean
  option?: boolean
}

type ChatInputKeyInterceptState = {
  hasSlashSuggestions: boolean
  hasMentionSuggestions: boolean
  lastEditDueToNav: boolean
  cursorPosition: number
  inputLength: number
}

export function shouldInterceptChatInputKey(
  key: ChatInputKey,
  state: ChatInputKeyInterceptState,
): boolean {
  const isPlainEnter = isPlainEnterKey(key)
  const isTab = key.name === 'tab' && !key.ctrl && !key.meta && !key.option
  const isUp = key.name === 'up' && !key.ctrl && !key.meta && !key.option
  const isDown = key.name === 'down' && !key.ctrl && !key.meta && !key.option
  const isUpDown = isUp || isDown

  const hasSuggestions =
    state.hasSlashSuggestions || state.hasMentionSuggestions
  if (hasSuggestions) {
    if (isUpDown && state.lastEditDueToNav) {
      return true
    }
    if (isPlainEnter || isTab || isUpDown) {
      return true
    }
  }

  const historyUpEnabled = state.lastEditDueToNav || state.cursorPosition === 0
  const historyDownEnabled =
    state.lastEditDueToNav || state.cursorPosition === state.inputLength
  if (isUp && historyUpEnabled) {
    return true
  }
  if (isDown && historyDownEnabled) {
    return true
  }

  return false
}
