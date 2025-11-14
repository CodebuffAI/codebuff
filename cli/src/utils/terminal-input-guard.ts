import type { ReadStream } from 'tty'

let lockDepth = 0

function getReadableStdin(): ReadStream | null {
  const stdin = process.stdin as ReadStream | undefined
  if (!stdin) return null
  if (typeof stdin.pause !== 'function' || typeof stdin.resume !== 'function') {
    return null
  }
  return stdin
}

export async function withTerminalInputGuard<T>(
  work: () => Promise<T> | T,
): Promise<T> {
  const stdin = getReadableStdin()
  lockDepth += 1
  const manageInput = stdin && lockDepth === 1
  if (manageInput && stdin) {
    stdin.pause()
  }

  try {
    return await work()
  } finally {
    lockDepth = Math.max(0, lockDepth - 1)
    if (manageInput && stdin && lockDepth === 0) {
      stdin.resume()
    }
  }
}
