import { hasClipboardImage, readClipboardText } from './clipboard-image'
import type { InputValue } from '../state/chat-store'

export function getSubsequenceIndices(
  str: string,
  sub: string,
): number[] | null {
  let strIndex = 0
  let subIndex = 0

  const indices: number[] = []

  while (strIndex < str.length && subIndex < sub.length) {
    if (str[strIndex] === sub[subIndex]) {
      indices.push(strIndex)
      subIndex++
    }
    strIndex++
  }

  if (subIndex >= sub.length) {
    return indices
  }

  return null
}

export const BULLET_CHAR = '• '

/**
 * Insert text at cursor position and return the new text and cursor position.
 */
function insertTextAtCursor(
  text: string,
  cursorPosition: number,
  textToInsert: string,
): { newText: string; newCursor: number } {
  const before = text.slice(0, cursorPosition)
  const after = text.slice(cursorPosition)
  return {
    newText: before + textToInsert + after,
    newCursor: before.length + textToInsert.length,
  }
}

/**
 * Creates a paste handler for text-only inputs (feedback, ask-user, etc.).
 * Reads from clipboard with OpenTUI fallback, then inserts at cursor.
 */
export function createTextPasteHandler(
  text: string,
  cursorPosition: number,
  onChange: (value: InputValue) => void,
): (fallbackText?: string) => void {
  return (fallbackText) => {
    const pasteText = readClipboardText() ?? fallbackText
    if (!pasteText) return
    const { newText, newCursor } = insertTextAtCursor(text, cursorPosition, pasteText)
    onChange({ text: newText, cursorPosition: newCursor, lastEditDueToNav: false })
  }
}

/**
 * Creates a paste handler that supports both image and text paste.
 * Checks for image first, falls back to text paste.
 */
export function createPasteHandler(options: {
  text: string
  cursorPosition: number
  onChange: (value: InputValue) => void
  onPasteImage?: () => void
}): (fallbackText?: string) => void {
  const { text, cursorPosition, onChange, onPasteImage } = options
  return (fallbackText) => {
    // Check for image first if handler provided
    if (onPasteImage && hasClipboardImage()) {
      onPasteImage()
      return
    }
    // Handle text paste
    const pasteText = readClipboardText() ?? fallbackText
    if (pasteText) {
      const { newText, newCursor } = insertTextAtCursor(text, cursorPosition, pasteText)
      onChange({ text: newText, cursorPosition: newCursor, lastEditDueToNav: false })
    }
  }
}