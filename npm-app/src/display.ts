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
let previousVisibleBuffer = ''

function isLineEmpty(y: number): boolean {
  const row = (screen as any).buffer?.[y] as { char: string }[] | undefined
  if (!row) return true
  return row.every((cell) => cell.char === ' ' || cell.char === '')
}

function squashVisibleNewlinesFromBuffer(combined: string): [string, string] {
  const lines = combined.split('\n')
  const output: string[] = []
  let blankStreak = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const plain = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    const isEmpty = plain.trim() === ''

    if (i < lines.length - 1) {
      // Line ends with \n
      if (isEmpty) {
        blankStreak++
        // Allow at most TWO consecutive blank lines
        // This might result in a triple newline at chunk boundaries
        // due to the way chunks are processed, but it's better than
        // collapsing double newlines into single ones
        if (blankStreak <= 2) output.push('')
      } else {
        blankStreak = 0
        output.push(line)
      }
    } else {
      // Last line (could be partial or complete ending with \n)
      const endsWithNewline = combined.endsWith('\n')
      if (endsWithNewline && isEmpty) {
        // It's a blank line resulting from a trailing newline
        blankStreak++
        // Allow at most TWO consecutive blank lines
        if (blankStreak <= 2) output.push('')
      } else {
        // It's a non-empty last line, or an empty partial line
        blankStreak = 0 // Reset streak if last line has content or is partial
        output.push(line)
      }
    }
  }

  const result = output.join('\n')

  // Calculate the new trailing state based on the *output*
  let lastNonEmptyIndex = -1
  for (let i = output.length - 1; i >= 0; i--) {
    // Check the plain version of the output line for emptiness
    const plainOutputLine = output[i].replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    if (plainOutputLine.trim() !== '') {
      lastNonEmptyIndex = i
      break
    }
  }

  // The trailing state includes everything from the last non-empty line onwards
  // If all lines were empty, lastNonEmptyIndex remains -1, and slice(0) takes all.
  const newTrailing = output.slice(lastNonEmptyIndex + 1).join('\n')

  // Return the full squashed result and the calculated trailing state for the *next* iteration
  return [result, newTrailing]
}

function writeToTerminalAndBuffer(
  chunkStr: string,
  originalWrite: typeof process.stdout.write
) {
  // Write directly to real terminal
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

      let processed = chunkStr
      if (enabled) {
        const combined = previousVisibleBuffer + chunkStr
        // squashVisibleNewlinesFromBuffer now returns the full squashed result and the new trailing state
        const [squashed, newTrailing] =
          squashVisibleNewlinesFromBuffer(combined)
        // Calculate the actual string to write based on the difference
        // This assumes the previous state was correctly rendered previously
        // and we only need to append the difference.
        // Note: This calculation might result in an extra newline at chunk boundaries
        // when squashing occurs across the boundary, but this is preferable to
        // collapsing double newlines into single ones.
        processed = squashed.slice(previousVisibleBuffer.length)
        // Update previousVisibleBuffer with the state needed for the *next* chunk
        previousVisibleBuffer = newTrailing
      }

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
