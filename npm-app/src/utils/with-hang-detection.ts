import { createTimeoutDetector } from './rage-detector'

export async function withHangDetection<T>(
  commandName: string,
  commandFn: () => Promise<T>
): Promise<T> {
  const hangDetector = createTimeoutDetector({
    reason: 'command_hung',
    timeoutMs: 60_000,
  })
  hangDetector.start({ commandName })

  try {
    return await commandFn()
  } finally {
    hangDetector.stop()
  }
}
