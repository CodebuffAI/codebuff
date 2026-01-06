/**
 * Activity Tracker Module
 * 
 * A singleton module that tracks user activity in the terminal.
 * Used by the ads feature and activity-aware query hooks.
 */

type ActivityListener = (timestamp: number) => void

const listeners = new Set<ActivityListener>()
let lastActivityTime = Date.now()

/**
 * Report that the user performed an activity.
 * Call this when:
 * - User types in the input field
 * - User moves the mouse
 * - User presses keyboard shortcuts
 */
export function reportActivity(): void {
  lastActivityTime = Date.now()
  for (const listener of listeners) {
    listener(lastActivityTime)
  }
}

/**
 * Get the timestamp of the last user activity.
 */
export function getLastActivityTime(): number {
  return lastActivityTime
}

/**
 * Check if the user is currently active (within the idle threshold).
 * @param idleThresholdMs - Time in ms to consider user idle (default: 30 seconds)
 */
export function isUserActive(idleThresholdMs: number = 30_000): boolean {
  return Date.now() - lastActivityTime < idleThresholdMs
}

/**
 * Get the time in ms since the last activity.
 */
export function getIdleTime(): number {
  return Date.now() - lastActivityTime
}

/**
 * Subscribe to activity events.
 * @returns Unsubscribe function
 */
export function subscribeToActivity(callback: ActivityListener): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

/**
 * Reset the activity tracker (mainly for testing).
 */
export function resetActivityTracker(): void {
  lastActivityTime = Date.now()
  listeners.clear()
}
