import type { QueueItem } from './types'

/**
 * How a queue item reads in the chat transcript when it's delivered. Skill and
 * workflow prompts are long instruction blocks, so they show as a compact
 * command label (e.g. `/review`). A user prompt shows its display label when
 * one exists (the typed text + 📎 summary for attachment messages); assistant
 * suggestions always show the full prompt that was sent.
 *
 * Shared between the engine (which persists the record when a queued item runs
 * or is sent now) and the renderer (which appends it optimistically in
 * `sendNow`) so the two can never drift — same pattern as `appendBlock`.
 */
export function queueItemChatText(
  item: Pick<QueueItem, 'source' | 'label' | 'skillName' | 'prompt'>,
): string {
  if (item.source === 'skill' || item.source === 'workflow') {
    return `/${item.label ?? item.skillName ?? 'skill'}`
  }
  return (item.source === 'user' && item.label) || item.prompt
}
