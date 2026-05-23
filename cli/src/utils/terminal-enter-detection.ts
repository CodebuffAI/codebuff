import { isKeypadEnter } from './keypad-keys'

/**
 * Most terminals send \r for Enter and \n for Ctrl+J. A few niche Linux
 * terminal emulators send \n for Enter instead, making the two
 * indistinguishable. We detect this at runtime by tracking whether we've
 * ever seen a \r ("return") key event. On macOS, Enter always sends \r.
 */

type EnterDetectionKey = {
  name?: string
  sequence?: string
}

const defaultHasSeenReturnKey = process.platform === 'darwin'

let hasSeenReturnKey = defaultHasSeenReturnKey

export function shouldMarkReturnKeySeen(key: EnterDetectionKey): boolean {
  return (key.name === 'return' || key.name === 'enter') && !isKeypadEnter(key)
}

export function markReturnKeySeen(): void {
  hasSeenReturnKey = true
}

export function markReturnKeySeenForKey(key: EnterDetectionKey): void {
  if (shouldMarkReturnKeySeen(key)) {
    markReturnKeySeen()
  }
}

/** True when a "linefeed" (\n) key event should be treated as Enter. */
export function isLinefeedActingAsEnter(): boolean {
  return !hasSeenReturnKey
}

export function resetReturnKeySeenForTests(
  hasSeenReturn: boolean = defaultHasSeenReturnKey,
): void {
  hasSeenReturnKey = hasSeenReturn
}
