import { closeSync, openSync, writeSync } from 'fs'
import { createRequire } from 'module'

import { getCliEnv } from './env'
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
    let copied: boolean
    if (isRemoteSession()) {
      // Remote/SSH: prefer OSC 52 (copies to client terminal's clipboard)
      copied = tryCopyViaOsc52(text) || tryCopyViaPlatformTool(text)
    } else {
      // Local: prefer platform tools (reliable with tmux), OSC 52 as fallback
      copied = tryCopyViaPlatformTool(text) || tryCopyViaOsc52(text)
    }

    if (!copied) {
      throw new Error('No clipboard method available')
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


// =============================================================================
// OSC52 Clipboard Support
// =============================================================================
// OSC52 writes to clipboard via terminal escape sequences - works over SSH
// because the client terminal handles clipboard. Format: ESC ] 52 ; c ; <base64> BEL
// tmux/screen require passthrough wrapping to forward the sequence.

function isRemoteSession(): boolean {
  const env = getCliEnv()
  return !!(env.SSH_CLIENT || env.SSH_TTY || env.SSH_CONNECTION)
}

function tryCopyViaPlatformTool(text: string): boolean {
  const { execSync } = require('child_process') as typeof import('child_process')
  const opts = { input: text, stdio: ['pipe', 'ignore', 'ignore'] as ('pipe' | 'ignore')[] }

  try {
    if (process.platform === 'darwin') {
      execSync('pbcopy', opts)
    } else if (process.platform === 'linux') {
      try {
        execSync('xclip -selection clipboard', opts)
      } catch {
        execSync('xsel --clipboard --input', opts)
      }
    } else if (process.platform === 'win32') {
      execSync('clip', opts)
    } else {
      return false
    }
    return true
  } catch {
    return false
  }
}

// 32KB is safe for all environments (tmux is the strictest)
const OSC52_MAX_PAYLOAD = 32_000

function buildOsc52Sequence(text: string): string | null {
  const env = getCliEnv()
  if (env.TERM === 'dumb') return null

  const base64 = Buffer.from(text, 'utf8').toString('base64')
  if (base64.length > OSC52_MAX_PAYLOAD) return null

  const osc = `\x1b]52;c;${base64}\x07`

  // tmux: wrap in DCS passthrough with doubled ESC
  if (env.TMUX) {
    return `\x1bPtmux;${osc.replace(/\x1b/g, '\x1b\x1b')}\x1b\\`
  }

  // GNU screen: wrap in DCS passthrough
  if (env.STY) {
    return `\x1bP${osc}\x1b\\`
  }

  return osc
}

function tryCopyViaOsc52(text: string): boolean {
  const sequence = buildOsc52Sequence(text)
  if (!sequence) return false

  const ttyPath = process.platform === 'win32' ? 'CON' : '/dev/tty'
  let fd: number | null = null
  try {
    fd = openSync(ttyPath, 'w')
    writeSync(fd, sequence)
    return true
  } catch {
    return false
  } finally {
    if (fd !== null) closeSync(fd)
  }
}
