/**
 * Most terminals send \r for Enter and \n for Ctrl+J. A few niche Linux
 * terminal emulators send \n for Enter instead, making the two
 * indistinguishable. We detect this at runtime by tracking whether we've
 * ever seen a \r ("return") key event. On macOS, Enter always sends \r.
 */

let hasSeenReturnKey = process.platform === 'darwin'

export function markReturnKeySeen(): void {
  hasSeenReturnKey = true
}

/** True when a "linefeed" (\n) key event should be treated as Enter. */
export function isLinefeedActingAsEnter(): boolean {
  return !hasSeenReturnKey
}
