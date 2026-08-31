/**
 * Mid-turn steering buffer.
 *
 * The agent loop runs in-process (SDK → agent-runtime), and the runtime
 * drains `RunOptions.drainSteeringMessages` at every step boundary: any
 * returned texts are appended to the conversation as user prompts and keep
 * the turn going. This module is the CLI-side mailbox between the composer
 * (router) and the active run (use-send-message), mirroring the claim/accept
 * shape freebuff-desktop uses for the same hook.
 *
 * The router echoes the transcript bubble at push time and records its id
 * here, so an entry the run never drains can have its bubble retracted when
 * the text is requeued as a fresh turn (which mints its own bubble).
 *
 * Owner-guarded like active-run.ts: an aborted run resolving late must not
 * drain or clear a newer run's buffer.
 */

export type SteeringEntry = {
  /** Transcript id of the bubble echoed when the entry was pushed. */
  messageId: string
  text: string
}

let activeOwnerId: string | null = null
let buffer: SteeringEntry[] = []

/** Called by use-send-message right before client.run(). */
export function activateSteering(ownerId: string): void {
  activeOwnerId = ownerId
  buffer = []
}

/**
 * Called by use-send-message when the run settles. Returns any entries the
 * run never drained (submitted after its last step boundary) so the caller
 * can retract their bubbles and requeue the texts instead of dropping them.
 */
export function deactivateSteering(ownerId: string): SteeringEntry[] {
  if (activeOwnerId !== ownerId) return []
  activeOwnerId = null
  const leftovers = buffer
  buffer = []
  return leftovers
}

/**
 * Called by the router on a mid-turn submit. Returns false when no run is
 * accepting steering (caller falls back to the queue).
 */
export function pushSteeringMessage(entry: SteeringEntry): boolean {
  if (activeOwnerId === null) return false
  buffer.push(entry)
  return true
}

/** True while a run is accepting steering pushes. */
export function isSteeringActive(): boolean {
  return activeOwnerId !== null
}

/** Called by the run's drainSteeringMessages hook at each step boundary. */
export function drainSteeringMessages(ownerId: string): SteeringEntry[] {
  if (activeOwnerId !== ownerId || buffer.length === 0) return []
  const drained = buffer
  buffer = []
  return drained
}

/** Test seam. */
export function __resetSteeringForTests(): void {
  activeOwnerId = null
  buffer = []
}
