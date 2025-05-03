import type { ScreenBuffer as ScreenBufferType, Terminal } from 'terminal-kit'
import termkit from 'terminal-kit'

const { ScreenBuffer, terminal } = termkit

let enabled = false

export function enableSquashNewlines() {
  enabled = true
}

export function disableSquashNewlines() {
  enabled = false
}

// Save original unpatched write functions to avoid recursion
const originalStdoutWrite = process.stdout.write.bind(process.stdout)
const originalStderrWrite = process.stderr.write.bind(process.stderr)

// Create a virtual screen buffer (not rendered to real terminal)
const screen = ScreenBuffer.create({
  dst: terminal as Terminal,
  width: 100,
  height: 100,
  noFill: true,
}) as ScreenBufferType

let cursorY = 0

function squashVisibleNewlines(chunkStr: string): string {
  const lines = chunkStr.split('\n')
  const output: string[] = []
  let blankStreak = 0

  for (const line of lines) {
    const plain = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    const isEmpty = plain.trim() === ''

    if (isEmpty) {
      blankStreak++
      if (blankStreak <= 2) {
        output.push(line)
      }
    } else {
      blankStreak = 0
      output.push(line)
    }
  }

  return output.join('\n')
}

function writeToTerminalAndBuffer(
  chunkStr: string,
  originalWrite: typeof process.stdout.write
) {
  // Directly write using unpatched write function to avoid recursion
  originalWrite(chunkStr)

  screen.put(
    {
      x: 0,
      y: cursorY,
      attr: {},
      wrap: false,
      dx: 0,
      dy: 0,
    },
    chunkStr
  )

  cursorY += chunkStr.split('\n').length - 1
}

function patchWriteStream(
  originalWrite: typeof process.stdout.write
): typeof process.stdout.write {
  let isPatching = false

  return function (
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((err?: Error | undefined) => void),
    callbackMaybe?: (err?: Error | undefined) => void
  ): boolean {
    if (isPatching) {
      return originalWrite(
        chunk as any,
        encodingOrCallback as any,
        callbackMaybe
      )
    }

    isPatching = true
    try {
      const chunkStr = Buffer.isBuffer(chunk)
        ? chunk.toString()
        : (chunk as string)
      const processed = enabled ? squashVisibleNewlines(chunkStr) : chunkStr
      writeToTerminalAndBuffer(processed, originalWrite)
    } finally {
      isPatching = false
    }

    if (typeof encodingOrCallback === 'function') {
      return originalWrite('', encodingOrCallback)
    }
    return originalWrite('', encodingOrCallback, callbackMaybe)
  }
}

// Patch stdout and stderr
process.stdout.write = patchWriteStream(originalStdoutWrite)
process.stderr.write = patchWriteStream(originalStderrWrite)
