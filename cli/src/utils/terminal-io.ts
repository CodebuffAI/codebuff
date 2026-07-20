import { closeSync, constants, openSync, writeSync } from 'fs'

/**
 * Write terminal control bytes synchronously to the controlling terminal.
 * OpenTUI may capture stdout, so control sequences use /dev/tty (or CON on
 * Windows) instead of the process.stdout stream.
 */
export function writeTerminalControlSync(
  value: string,
  ttyPath = process.platform === 'win32' ? 'CON' : '/dev/tty',
): boolean {
  let fd: number | null = null

  try {
    fd = openSync(ttyPath, constants.O_WRONLY)
    const bytes = Buffer.from(value)
    let offset = 0
    while (offset < bytes.length) {
      const written = writeSync(fd, bytes, offset, bytes.length - offset)
      if (written === 0) return false
      offset += written
    }
    return true
  } catch {
    return false
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {
        // The process is exiting; there is nothing useful to recover here.
      }
    }
  }
}
