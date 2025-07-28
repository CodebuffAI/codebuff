/**
 * Overwrites writing multiple (more than 2) newlines for all functions.
 *
 * Only replaces raw '\n\n\n' strings. i.e. '\n\n' + green('\n\n'), still
 * renders as four newline characters. Because there is an ANSI escape
 * character between the first two and the last two newline characters.
 */
import stringWidth from 'string-width'
import {
  originalConsoleDebug,
  originalConsoleError,
  originalConsoleInfo,
  originalConsoleLog,
  originalConsoleWarn,
  originalStderrWrite,
  originalStdoutWrite,
} from './overrides'
import { printModeIsEnabled } from './print-mode'

const PREFIX = '.\r\n'
let squashingEnabled = false
let previous = PREFIX

export function getPrevious(): string {
  return previous
}

export function setPrevious(str: string): void {
  previous = str
}

export function enableSquashNewlines(): void {
  squashingEnabled = true
}

export function disableSquashNewlines(): void {
  squashingEnabled = false
}

/** OSC  …  BEL | ST   (titles, hyperlinks, cwd hints, etc.) */
const OSC = /\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/g

/** CSI  …  final-byte   (cursor moves, ?2004h, colours if stripAnsi missed them) */
const CSI = /\u001B\[[0-?]*[ -/]*[@-~]/g

/** Zero-width Unicode code-points (format, combining, enclosing) */
const ZW = /[\p{Cf}\p{Mn}\p{Me}]/gu

/**
 * `true` → after stripping VT controls and whitespace the string has zero width
 */
export function onlyWhitespace(raw: string): boolean {
  const visible = raw
    .replace(OSC, '') // remove OSC 0/7/8/133/697/…
    .replace(CSI, '') // remove CSI H, A, ?2004h, …
    .replace(/\s+/g, '') // remove spaces, tabs, CR, LF
    .replace(ZW, '') // remove ZWJ, ZWNJ, VS16, etc.

  return stringWidth(visible) === 0
}

function addCarriageReturn(str: string): string {
  // Do not copy over \n from previous
  const base = (previous[previous.length - 1] === '\r' ? '\r' : '.') + str
  // Replace twice, because of no overlap '\n\n'
  const withCarriageReturns = base.replace(/(?<!\r)\n/g, '\r\n')
  return withCarriageReturns.slice(1)
}

function getLastTwoLines(str: string): string {
  return PREFIX + str.split('\r\n').slice(-2).join('\r\n')
}

export function squashNewlines(str: string): string {
  if (!str.startsWith(PREFIX)) {
    throw new Error(`Expected string to start with ${JSON.stringify(PREFIX)}`)
  }

  const lines = str
    .split('\r\n')
    .map((line) => ({ line, empty: onlyWhitespace(line) }))

  const agg: string[] = []
  let consecutiveEmptyLines = 0
  for (const { line, empty } of lines) {
    if (consecutiveEmptyLines > 1) {
      agg[agg.length - 1] += line
    } else {
      agg.push(line)
    }

    if (empty) {
      consecutiveEmptyLines++
    } else {
      consecutiveEmptyLines = 0
    }
  }

  return agg.join('\r\n')
}

/**
 * Common utility function to handle squashing logic for any write function
 */
function createSquashingWriteFunction<T extends Function>(
  originalWrite: T,
  isSquashingEnabled: () => boolean
): T {
  return function (
    chunk: string | Uint8Array,
    encodingOrCallback?:
      | BufferEncoding
      | ((err?: Error | null | undefined) => void),
    callbackMaybe?: (err?: Error | null | undefined) => void
  ): boolean {
    if (printModeIsEnabled()) {
      return false
    }
    let chunkString = typeof chunk === 'string' ? chunk : chunk.toString()
    chunkString = addCarriageReturn(chunkString)

    if (!isSquashingEnabled()) {
      previous += chunkString
      previous = getLastTwoLines(previous)

      if (typeof encodingOrCallback === 'function') {
        return originalWrite(chunkString, encodingOrCallback)
      }
      return originalWrite(chunkString, encodingOrCallback, callbackMaybe)
    }

    const combinedContent = previous + chunkString
    const processedContent = squashNewlines(combinedContent)
    const processedChunk = processedContent.slice(previous.length)
    previous = getLastTwoLines(processedContent)

    if (typeof encodingOrCallback === 'function') {
      return originalWrite(processedChunk, encodingOrCallback)
    }
    return originalWrite(processedChunk, encodingOrCallback, callbackMaybe)
  } as any as T
}

// Override stdout and stderr write functions
process.stdout.write = createSquashingWriteFunction(
  originalStdoutWrite,
  () => squashingEnabled
)

process.stderr.write = createSquashingWriteFunction(
  originalStderrWrite,
  () => squashingEnabled
)

console.log = function (...args: any[]) {
  if (!squashingEnabled) {
    if (printModeIsEnabled()) {
      return
    }
    return originalConsoleLog(...args)
  }

  // Convert arguments to string and process through squashing logic
  const output =
    args
      .map((arg) =>
        typeof arg === 'string'
          ? arg
          : typeof arg === 'object'
            ? JSON.stringify(arg, null, 2)
            : String(arg)
      )
      .join(' ') + '\n'

  process.stdout.write(output)
}

console.error = function (...args: any[]) {
  if (!squashingEnabled) {
    if (printModeIsEnabled()) {
      return
    }
    return originalConsoleError(...args)
  }

  // Convert arguments to string and process through squashing logic
  const output =
    args
      .map((arg) =>
        typeof arg === 'string'
          ? arg
          : typeof arg === 'object'
            ? JSON.stringify(arg, null, 2)
            : String(arg)
      )
      .join(' ') + '\n'

  process.stderr.write(output)
}

console.warn = function (...args: any[]) {
  if (!squashingEnabled) {
    if (printModeIsEnabled()) {
      return
    }
    return originalConsoleWarn(...args)
  }

  // Convert arguments to string and process through squashing logic
  const output =
    args
      .map((arg) =>
        typeof arg === 'string'
          ? arg
          : typeof arg === 'object'
            ? JSON.stringify(arg, null, 2)
            : String(arg)
      )
      .join(' ') + '\n'

  process.stdout.write(output)
}

console.debug = function (...args: any[]) {
  if (!squashingEnabled) {
    if (printModeIsEnabled()) {
      return
    }
    return originalConsoleDebug(...args)
  }

  // Convert arguments to string and process through squashing logic
  const output =
    args
      .map((arg) =>
        typeof arg === 'string'
          ? arg
          : typeof arg === 'object'
            ? JSON.stringify(arg, null, 2)
            : String(arg)
      )
      .join(' ') + '\n'

  process.stdout.write(output)
}

console.info = function (...args: any[]) {
  if (!squashingEnabled) {
    if (printModeIsEnabled()) {
      return
    }
    return originalConsoleInfo(...args)
  }

  // Convert arguments to string and process through squashing logic
  const output =
    args
      .map((arg) =>
        typeof arg === 'string'
          ? arg
          : typeof arg === 'object'
            ? JSON.stringify(arg, null, 2)
            : String(arg)
      )
      .join(' ') + '\n'

  process.stdout.write(output)
}
