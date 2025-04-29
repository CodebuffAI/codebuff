/**
 * Overwrites writing multiple (more than 2) newlines for all functions.
 *
 * Only replaces raw '\n\n\n' strings. i.e. '\n\n' + green('\n\n'), still
 * renders as four newline characters. Because there is an ANSI escape
 * character between the first two and the last two newline characters.
 */

let enabled = false
let previous = ''

export function enableSquashNewlines() {
  enabled = true
}

export function disableSquashNewlines() {
  enabled = false
}

const originalWrite = process.stdout.write.bind(process.stdout)

process.stdout.write = function (
  chunk: string | Uint8Array,
  encodingOrCallback?: BufferEncoding | ((err?: Error | undefined) => void),
  callbackMaybe?: (err?: Error | undefined) => void
): boolean {
  const chunkString = Buffer.isBuffer(chunk) ? chunk.toString() : chunk
  if (!enabled) {
    previous += chunkString
    previous = previous.slice(previous.length - 2)

    if (typeof encodingOrCallback === 'function') {
      // Called like write(chunk, callback)
      return originalWrite(chunkString, encodingOrCallback)
    }
    // Called like write(chunk, encoding, callback)
    return originalWrite(chunkString, encodingOrCallback, callbackMaybe)
  }

  const combinedContent = previous + chunkString
  const processedContent = combinedContent.replace(/\n{3,}/g, '\n\n')
  const processedChunk = processedContent.slice(previous.length)
  previous = processedContent.slice(processedContent.length - 2)

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
  encodingOrCallback?: BufferEncoding | ((err?: Error | undefined) => void),
  callbackMaybe?: (err?: Error | undefined) => void
): boolean {
  const chunkString = Buffer.isBuffer(chunk) ? chunk.toString() : chunk
  if (!enabled) {
    previous += chunkString
    previous = previous.slice(previous.length - 2)

    if (typeof encodingOrCallback === 'function') {
      // Called like write(chunk, callback)
      return originalError(chunkString, encodingOrCallback)
    }
    // Called like write(chunk, encoding, callback)
    return originalError(chunkString, encodingOrCallback, callbackMaybe)
  }

  const combinedContent = previous + chunkString
  const processedContent = combinedContent.replace(/\n{3,}/g, '\n\n')
  const processedChunk = processedContent.slice(previous.length)
  previous = processedContent.slice(processedContent.length - 2)

  if (typeof encodingOrCallback === 'function') {
    // Called like write(chunk, callback)
    return originalError(processedChunk, encodingOrCallback)
  }
  // Called like write(chunk, encoding, callback)
  return originalError(processedChunk, encodingOrCallback, callbackMaybe)
} as typeof process.stderr.write
