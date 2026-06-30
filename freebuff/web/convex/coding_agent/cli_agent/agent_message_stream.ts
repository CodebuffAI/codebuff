import type { MutationCtx } from '../../_generated/server'
import type { Id } from '../../_generated/dataModel'

// Shared helpers for the append-only streaming model.
//
// The streamed assistant response is written as tiny `agent_message_delta` rows
// while a run is in flight (one row per flushed chunk), instead of read-modify-
// writing the whole `assistant_stream` array on the message doc on every flush.
// When the run finalizes, the deltas are coalesced (merged + capped) into a
// single immutable `agent_message_body` row and the delta rows are deleted. The
// inline `assistant_stream` field on `agent_message` is cleared at the same time
// so list reads stay light. See schema.ts for the rationale.

export type StreamItem = {
  type: string
  title?: string
  status?: string
  content: string
  description?: string
}

// Hard ceiling on the coalesced body. Bounds a runaway/looping agent so a single
// message can't grow without limit (and can't approach the 1 MiB doc limit).
const MAX_ASSISTANT_STREAM_ITEMS = 2_000
const MAX_ASSISTANT_STREAM_CHARS = 400_000
const TRUNCATABLE_STREAM_TYPES = new Set([
  'text',
  'reasoning',
  'subagent',
  'assistant',
  'thinking',
])
const MERGEABLE_STREAM_TYPES = new Set([
  'text',
  'reasoning',
  'subagent',
  'assistant',
  'thinking',
])

function streamCharCount(items: StreamItem[]): number {
  let total = 0
  for (const item of items) total += item.content.length
  return total
}

export function appendOrMergeStreamItem(
  stream: StreamItem[],
  item: StreamItem,
) {
  // Status / ask_user / error / timeout markers may be empty-content and must be
  // kept; empty mergeable (streamed-text) chunks add nothing, so drop them.
  if (!item.content && MERGEABLE_STREAM_TYPES.has(item.type)) return

  const previous = stream[stream.length - 1]
  const canMerge =
    previous &&
    previous.type === item.type &&
    previous.title === item.title &&
    previous.status === item.status &&
    previous.description === item.description &&
    MERGEABLE_STREAM_TYPES.has(item.type)

  if (canMerge) {
    previous.content += item.content
    return
  }

  stream.push(item)
}

export function compactStream(items: StreamItem[]): StreamItem[] {
  const compacted: StreamItem[] = []
  for (const item of items) appendOrMergeStreamItem(compacted, { ...item })
  return compacted
}

// Cap the persisted stream so a single message can't grow without bound. Drops
// the oldest truncatable (streamed-text) items first and inserts one notice.
// Keeps non-truncatable markers (status/error/ask_user/timeout) so UI state
// survives.
export function capStream(items: StreamItem[]): StreamItem[] {
  if (
    items.length <= MAX_ASSISTANT_STREAM_ITEMS &&
    streamCharCount(items) <= MAX_ASSISTANT_STREAM_CHARS
  ) {
    return items
  }

  const result = [...items]
  const dropOldestTruncatable = () => {
    const idx = result.findIndex((item) =>
      TRUNCATABLE_STREAM_TYPES.has(item.type),
    )
    if (idx === -1) return false
    result.splice(idx, 1)
    return true
  }

  while (
    (result.length > MAX_ASSISTANT_STREAM_ITEMS ||
      streamCharCount(result) > MAX_ASSISTANT_STREAM_CHARS) &&
    dropOldestTruncatable()
  ) {
    // keep dropping until we're under both limits or out of truncatable items
  }

  const alreadyNotified =
    result[0]?.type === 'status' && result[0]?.title === 'Output truncated'
  if (!alreadyNotified) {
    result.unshift({
      type: 'status',
      title: 'Output truncated',
      content:
        'Earlier streamed output was trimmed to keep this message within size limits.',
    })
  }
  return result
}

// Append one or more streamed items as delta rows. O(items) writes; no
// read-modify-write of the growing message body.
export async function appendDeltaItems(
  ctx: MutationCtx,
  messageId: Id<'agent_message'>,
  items: StreamItem[],
) {
  const filtered = items.filter(
    (item) => item.content || !MERGEABLE_STREAM_TYPES.has(item.type),
  )
  if (filtered.length === 0) return

  const message = await ctx.db.get(messageId)
  if (!message) return
  let seq = message.stream_seq ?? 0
  for (const item of filtered) {
    await ctx.db.insert('agent_message_delta', {
      message_id: messageId,
      seq,
      type: item.type,
      title: item.title,
      status: item.status,
      content: item.content,
      description: item.description,
    })
    seq += 1
  }
  await ctx.db.patch(messageId, { stream_seq: seq })
}

export async function readDeltaItems(
  ctx: MutationCtx,
  messageId: Id<'agent_message'>,
): Promise<{ rows: Array<{ _id: Id<'agent_message_delta'> }>; items: StreamItem[] }> {
  const rows = await ctx.db
    .query('agent_message_delta')
    .withIndex('by_message_seq', (q) => q.eq('message_id', messageId))
    .order('asc')
    .collect()
  const items: StreamItem[] = rows.map((r) => ({
    type: r.type,
    title: r.title,
    status: r.status,
    content: r.content,
    description: r.description,
  }))
  return { rows, items }
}

// Coalesce any inline assistant_stream + live delta rows (+ optional extra
// terminal items) into a single immutable body row, clear the inline array and
// seq counter, and delete the delta rows. Idempotent and safe to call on a
// message that has neither inline content nor deltas.
export async function finalizeMessageStream(
  ctx: MutationCtx,
  messageId: Id<'agent_message'>,
  opts?: { extraItems?: StreamItem[]; messagePatch?: Record<string, unknown> },
): Promise<StreamItem[]> {
  const message = await ctx.db.get(messageId)
  if (!message) return []

  const inline = (message.assistant_stream ?? []) as StreamItem[]
  const { rows, items: deltaItems } = await readDeltaItems(ctx, messageId)

  const combined = capStream(
    compactStream([...inline, ...deltaItems, ...(opts?.extraItems ?? [])]),
  )

  const existingBody = await ctx.db
    .query('agent_message_body')
    .withIndex('by_message', (q) => q.eq('message_id', messageId))
    .unique()
  if (existingBody) {
    await ctx.db.patch(existingBody._id, { stream: combined })
  } else {
    await ctx.db.insert('agent_message_body', {
      message_id: messageId,
      thread_id: message.thread_id,
      stream: combined,
    })
  }

  await ctx.db.patch(messageId, {
    assistant_stream: undefined,
    stream_seq: undefined,
    ...(opts?.messagePatch ?? {}),
  })

  for (const row of rows) await ctx.db.delete(row._id)

  return combined
}
