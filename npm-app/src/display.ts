/**
 * Overwrites writing multiple (more than 2) newlines for all functions.
 *
 * Only replaces raw '\n\n\n' strings. i.e. '\n\n' + green('\n\n'), still
 * renders as four newline characters. Because there is an ANSI escape
 * character between the first two and the last two newline characters.
 */

let squashingEnabled = false
let previous = ' '

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

function addCarriageReturn(str: string): string {
  // Do not copy over \n from previous
  const base = (previous[previous.length - 1] === '\r' ? '\r' : ' ') + str
  // Replace twice, because of no overlap '\n\n'
  const withCarriageReturns = base.replace(/(?<!\r)\n/g, '\r\n')
  return withCarriageReturns.slice(1)
}

const originalWrite = process.stdout.write.bind(process.stdout)

process.stdout.write = function (
  chunk: string | Uint8Array,
  encodingOrCallback?:
    | BufferEncoding
    | ((err?: Error | null | undefined) => void),
  callbackMaybe?: (err?: Error | null | undefined) => void
): boolean {
  let chunkString = typeof chunk === 'string' ? chunk : chunk.toString()
  chunkString = addCarriageReturn(chunkString)

  if (!squashingEnabled) {
    previous += chunkString
    previous = previous.slice(previous.length - 4)

    if (typeof encodingOrCallback === 'function') {
      // Called like write(chunk, callback)
      return originalWrite(chunkString, encodingOrCallback)
    }
    // Called like write(chunk, encoding, callback)
    return originalWrite(chunkString, encodingOrCallback, callbackMaybe)
  }

  const combinedContent = previous + chunkString
  const processedContent = combinedContent.replace(/(\r\n){3,}/g, '\r\n\r\n')
  const processedChunk = processedContent.slice(previous.length)
  previous = processedContent.slice(processedContent.length - 4)

  if (typeof encodingOrCallback === 'function') {
    // Called like write(chunk, callback)
    return originalWrite(processedChunk, encodingOrCallback)
  }
  // Called like write(chunk, encoding, callback)
  return originalWrite(processedChunk, encodingOrCallback, callbackMaybe)
} as typeof process.stdout.write

const originalError = process.stderr.write.bind(process.stderr)

process.stderr.write = function (
  chunk: string | Uint8Array,
  encodingOrCallback?:
    | BufferEncoding
    | ((err?: Error | null | undefined) => void),
  callbackMaybe?: (err?: Error | null | undefined) => void
): boolean {
  let chunkString = typeof chunk === 'string' ? chunk : chunk.toString()
  chunkString = addCarriageReturn(chunkString)

  if (!squashingEnabled) {
    previous += chunkString
    previous = previous.slice(previous.length - 4)

    if (typeof encodingOrCallback === 'function') {
      // Called like write(chunk, callback)
      return originalError(chunkString, encodingOrCallback)
    }
    // Called like write(chunk, encoding, callback)
    return originalError(chunkString, encodingOrCallback, callbackMaybe)
  }

  const combinedContent = previous + chunkString
  const processedContent = combinedContent.replace(/\r\n{3,}/g, '\r\n\r\n')
  const processedChunk = processedContent.slice(previous.length)
  previous = processedContent.slice(processedContent.length - 4)

  if (typeof encodingOrCallback === 'function') {
    // Called like write(chunk, callback)
    return originalError(processedChunk, encodingOrCallback)
  }
  // Called like write(chunk, encoding, callback)
  return originalError(processedChunk, encodingOrCallback, callbackMaybe)
} as typeof process.stderr.write
