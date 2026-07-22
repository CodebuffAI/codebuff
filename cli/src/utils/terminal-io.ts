import { closeSync, constants, openSync, writeSync } from 'fs'

/** Write every byte to an already-open file descriptor before returning. */
export function writeFileDescriptorSync(fd: number, value: string): boolean {
  try {
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
  }
}

/** Report a fatal error without relying on async logging or console capture. */
export function reportFatalErrorSync(
  label: string,
  error: unknown,
  stderrFd: number = process.stderr.fd,
): void {
  const detail = formatFatalError(error)
  if (writeFileDescriptorSync(stderrFd, `${label}: ${detail}\n`)) return

  try {
    console.error(`${label}:`, error)
  } catch {
    // The process is already failing and stderr may be closed.
  }
}

/** Fatal boundaries must also survive values whose inspection itself throws. */
function formatFatalError(error: unknown): string {
  try {
    if (error instanceof Error) {
      for (const property of ['stack', 'message', 'name'] as const) {
        try {
          const value = error[property]
          if (!value) continue
          const formatted = stringifyFatalValue(value)
          if (formatted !== undefined) return formatted
        } catch {}
      }
    }
  } catch {}
  return stringifyFatalValue(error) ?? '<unprintable error>'
}

function stringifyFatalValue(value: unknown): string | undefined {
  try {
    return String(value)
  } catch {
    return undefined
  }
}

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
    return writeFileDescriptorSync(fd, value)
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
