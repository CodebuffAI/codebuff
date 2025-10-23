import { createRequire } from 'module'

import { logger } from './logger'

const require = createRequire(import.meta.url)

type ClipboardListener = (message: string | null) => void

let currentMessage: string | null = null
const listeners = new Set<ClipboardListener>()
let clearTimer: ReturnType<typeof setTimeout> | null = null

interface ShowMessageOptions {
  durationMs?: number
}

export function subscribeClipboardMessages(
  listener: ClipboardListener,
): () => void {
  listeners.add(listener)
  listener(currentMessage)
  return () => {
    listeners.delete(listener)
  }
}

function emitClipboardMessage(message: string | null) {
  currentMessage = message
  for (const listener of listeners) {
    listener(message)
  }
}

export function showClipboardMessage(
  message: string | null,
  options: ShowMessageOptions = {},
) {
  if (clearTimer) {
    clearTimeout(clearTimer)
    clearTimer = null
  }

  emitClipboardMessage(message)

  const duration = options.durationMs ?? 3000
  if (message && duration > 0) {
    clearTimer = setTimeout(() => {
      emitClipboardMessage(null)
      clearTimer = null
    }, duration)
  }
}

function getDefaultSuccessMessage(text: string): string | null {
  const preview = text.replace(/\s+/g, ' ').trim()
  if (!preview) {
    return null
  }
  const truncated =
    preview.length > 40 ? `${preview.slice(0, 37)}…` : preview
  return `Copied: "${truncated}"`
}

export interface CopyToClipboardOptions {
  successMessage?: string | null
  errorMessage?: string | null
  durationMs?: number
  suppressGlobalMessage?: boolean
}

export async function copyTextToClipboard(
  text: string,
  {
    successMessage,
    errorMessage,
    durationMs,
    suppressGlobalMessage = false,
  }: CopyToClipboardOptions = {},
) {
  if (!text || text.trim().length === 0) {
    return
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
    } else if (typeof process !== 'undefined' && process.platform) {
      const { execSync } = require('child_process') as {
        execSync: (command: string, options: { input: string }) => void
      }
      if (process.platform === 'darwin') {
        execSync('pbcopy', { input: text })
      } else if (process.platform === 'linux') {
        try {
          execSync('xclip -selection clipboard', { input: text })
        } catch {
          execSync('xsel --clipboard --input', { input: text })
        }
      } else if (process.platform === 'win32') {
        execSync('clip', { input: text })
      }
    } else {
      return
    }

    if (!suppressGlobalMessage) {
      const message =
        successMessage !== undefined
          ? successMessage
          : getDefaultSuccessMessage(text)
      if (message) {
        showClipboardMessage(message, { durationMs })
      }
    }
  } catch (error) {
    logger.error(error, 'Failed to copy to clipboard')
    if (!suppressGlobalMessage) {
      showClipboardMessage(
        errorMessage ?? 'Failed to copy to clipboard',
        { durationMs },
      )
    }
    throw error
  }
}

export function clearClipboardMessage() {
  if (clearTimer) {
    clearTimeout(clearTimer)
    clearTimer = null
  }
  emitClipboardMessage(null)
}
