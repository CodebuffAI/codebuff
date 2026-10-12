import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { AppendInstructionsError, MAX_APPEND_INSTRUCTIONS_BYTES, validateAppendInstructions } from '@codebuff/common/append-instructions'

export { AppendInstructionsError }

/** POSIX file input. Never retain filesystem errors, paths or contents in errors. */
export async function loadAppendInstructions(path?: string): Promise<string | undefined> {
  if (path === undefined) return undefined
  try {
    if (!['linux', 'darwin'].includes(process.platform) ||
        !isAbsolute(path) || /[\0\r\n]/.test(path) ||
        !constants.O_NOFOLLOW || !constants.O_NONBLOCK) {
      throw new AppendInstructionsError()
    }
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.size === 0 || stat.size > MAX_APPEND_INSTRUCTIONS_BYTES) {
        throw new AppendInstructionsError()
      }
      const bytes = Buffer.alloc(MAX_APPEND_INSTRUCTIONS_BYTES + 1)
      let length = 0
      while (length < bytes.length) {
        const { bytesRead } = await file.read(bytes, length, bytes.length - length, null)
        if (!bytesRead) break
        length += bytesRead
      }
      if (length > MAX_APPEND_INSTRUCTIONS_BYTES) throw new AppendInstructionsError()
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length))
      validateAppendInstructions(text)
      return text
    } finally {
      await file.close()
    }
  } catch {
    throw new AppendInstructionsError()
  }
}

/** Cache success AND failure for process lifetime, independent of auth/client resets. */
export function createAppendInstructionsSnapshot(loader = loadAppendInstructions) {
  let snapshot: Promise<string | undefined> | undefined
  return (path?: string) => snapshot ??= loader(path)
}
export const getProcessAppendInstructions = createAppendInstructionsSnapshot()
