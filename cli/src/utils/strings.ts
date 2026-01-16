import path from 'path'

import {
  hasClipboardImage,
  readClipboardText,
  readClipboardImageFilePath,
  getImageFilePathFromText,
} from './clipboard-image'
import { isImageFile } from './image-handler'
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

// Threshold for treating pasted text as an attachment instead of inline insertion
// Text longer than this value (not equal) becomes an attachment
export const LONG_TEXT_THRESHOLD = 1000

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
    const { newText, newCursor } = insertTextAtCursor(
      text,
      cursorPosition,
      pasteText,
    )
    onChange({
      text: newText,
      cursorPosition: newCursor,
      lastEditDueToNav: false,
    })
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
  onPasteLongText?: (text: string) => void
  cwd?: string
}): (fallbackText?: string) => void {
  const {
    text,
    cursorPosition,
    onChange,
    onPasteImage,
    onPasteImagePath,
    onPasteLongText,
    cwd,
  } = options
  return (fallbackText) => {
    // If we have direct input text from the paste event (e.g., from terminal paste),
    // check if it looks like an image filename and if we can get the full path from clipboard
    if (fallbackText && onPasteImagePath) {
      // The terminal often only passes the filename when pasting a file copied from Finder.
      // Check if this looks like just a filename (no path separators) that's an image.
      const looksLikeImageFilename =
        isImageFile(fallbackText) &&
        !fallbackText.includes('/') &&
        !fallbackText.includes('\\')

      if (looksLikeImageFilename) {
        // Try to get the full path from the clipboard's file URL
        const clipboardFilePath = readClipboardImageFilePath()
        // Verify the clipboard path's basename matches exactly (not just endsWith)
        if (
          clipboardFilePath &&
          path.basename(clipboardFilePath) === fallbackText
        ) {
          // The clipboard has the full path to the same file - use it!
          onPasteImagePath(clipboardFilePath)
          return
        }
      }

      // Check if fallbackText is a full path to an image file
      if (cwd) {
        const imagePath = getImageFilePathFromText(fallbackText, cwd)
        if (imagePath) {
          onPasteImagePath(imagePath)
          return
        }
      }
    }

    // fallbackText provided but not an image - check if it's long text
    if (fallbackText) {
      // If text is long, treat it as an attachment
      if (onPasteLongText && fallbackText.length > LONG_TEXT_THRESHOLD) {
        onPasteLongText(fallbackText)
        return
      }

      // Otherwise paste it as regular text
      const { newText, newCursor } = insertTextAtCursor(
        text,
        cursorPosition,
        fallbackText,
      )
      onChange({
        text: newText,
        cursorPosition: newCursor,
        lastEditDueToNav: false,
      })
      return
    }

    // No direct text provided - read from clipboard

    // First, check if clipboard contains a copied image file (e.g., from Finder)
    if (onPasteImagePath) {
      const copiedImagePath = readClipboardImageFilePath()
      if (copiedImagePath) {
        onPasteImagePath(copiedImagePath)
        return
      }
    }

    const clipboardText = readClipboardText()

    // Check if clipboard text is a path to an image file
    if (clipboardText && onPasteImagePath && cwd) {
      const imagePath = getImageFilePathFromText(clipboardText, cwd)
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
    if (!clipboardText) return

    // If text is long, treat it as an attachment
    if (onPasteLongText && clipboardText.length > LONG_TEXT_THRESHOLD) {
      onPasteLongText(clipboardText)
      return
    }

    const { newText, newCursor } = insertTextAtCursor(
      text,
      cursorPosition,
      clipboardText,
    )
    onChange({
      text: newText,
      cursorPosition: newCursor,
      lastEditDueToNav: false,
    })
  }
}
