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
  const truncated = preview.length > 40 ? `${preview.slice(0, 37)}…` : preview
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
      // NOTE: Inline require() is used because this code path only runs in Node.js
      // environments, and we need to check process.platform at runtime first
      const { execSync } = require('child_process') as typeof import('child_process')
      // Use stdio: ['pipe', 'ignore', 'ignore'] to prevent stderr from corrupting the TUI on headless servers
      // stdin needs 'pipe' for input, stdout/stderr use 'ignore' to discard any output
      const execOptions: { input: string; stdio: ('pipe' | 'ignore')[] } = {
        input: text,
        stdio: ['pipe', 'ignore', 'ignore'],
      }
      if (process.platform === 'darwin') {
        execSync('pbcopy', execOptions)
      } else if (process.platform === 'linux') {
        try {
          execSync('xclip -selection clipboard', execOptions)
        } catch {
          execSync('xsel --clipboard --input', execOptions)
        }
      } else if (process.platform === 'win32') {
        execSync('clip', execOptions)
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
      showClipboardMessage(errorMessage ?? 'Failed to copy to clipboard', {
        durationMs,
      })
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
