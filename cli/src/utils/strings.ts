import { hasClipboardImage, readClipboardText, getImageFilePathFromText } from './clipboard-image'
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
 * 
 * When fallbackText is provided (from drag-drop or native paste event),
 * it takes FULL priority over the clipboard. This is because:
 * - Drag operations provide file paths directly without updating the clipboard
 * - The clipboard might contain stale data from a previous copy operation
 * 
 * Only when NO fallbackText is provided do we read from the clipboard.
 */
export function createPasteHandler(options: {
  text: string
  cursorPosition: number
  onChange: (value: InputValue) => void
  onPasteImage?: () => void
  onPasteImagePath?: (imagePath: string) => void
  cwd?: string
}): (fallbackText?: string) => void {
  const { text, cursorPosition, onChange, onPasteImage, onPasteImagePath, cwd } = options
  return (fallbackText) => {
    // If we have direct input text from the paste event (e.g., from drag-drop),
    // use it exclusively and ignore the clipboard entirely.
    // Drag operations don't update the clipboard, so clipboard data would be stale.
    if (fallbackText) {
      // Check if it's a path to an image file
      if (onPasteImagePath && cwd) {
        const imagePath = getImageFilePathFromText(fallbackText, cwd)
        if (imagePath) {
          onPasteImagePath(imagePath)
          return
        }
      }
      
      // Not an image path, insert as regular text
      const { newText, newCursor } = insertTextAtCursor(text, cursorPosition, fallbackText)
      onChange({ text: newText, cursorPosition: newCursor, lastEditDueToNav: false })
      return
    }
    
    // No direct text provided - read from clipboard
    const pasteText = readClipboardText()
    
    // First check if clipboard text is a path to an image file
    // File paths take priority over clipboard image data
    if (pasteText && onPasteImagePath && cwd) {
      const imagePath = getImageFilePathFromText(pasteText, cwd)
      if (imagePath) {
        onPasteImagePath(imagePath)
        return
      }
    }
    
    // Check for actual image data (screenshots, copied images)
    if (onPasteImage && hasClipboardImage()) {
      onPasteImage()
      return
    }
    
    // Regular text paste
    if (!pasteText) return
    const { newText, newCursor } = insertTextAtCursor(text, cursorPosition, pasteText)
    onChange({ text: newText, cursorPosition: newCursor, lastEditDueToNav: false })
  }
}
