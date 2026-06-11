import db from '@codebuff/internal/db'
import {
  chatMessage,
  chatThread,
  chatUsageEvent,
  user,
} from '@codebuff/internal/db/schema'
import { and, count, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm'

export type ChatRole = 'user' | 'assistant'

export async function listThreads(userId: string) {
  return db
    .select({
      id: chatThread.id,
      title: chatThread.title,
      model: chatThread.model,
      updated_at: chatThread.updated_at,
    })
    .from(chatThread)
    .where(eq(chatThread.user_id, userId))
    .orderBy(desc(chatThread.updated_at))
    .limit(200)
}

export async function createThread(params: {
  userId: string
  title: string
  model: string
  /** Created pre-claimed so the imminent run owns the thread. */
  runClaimedUntil: Date
}) {
  const [thread] = await db
    .insert(chatThread)
    .values({
      user_id: params.userId,
      title: params.title,
      model: params.model,
      run_claimed_until: params.runClaimedUntil,
    })
    .returning({
      id: chatThread.id,
      title: chatThread.title,
      run_state: chatThread.run_state,
    })
  return thread
}

export async function getThread(userId: string, threadId: string) {
  const [thread] = await db
    .select({
      id: chatThread.id,
      title: chatThread.title,
      model: chatThread.model,
      created_at: chatThread.created_at,
      updated_at: chatThread.updated_at,
    })
    .from(chatThread)
    .where(and(eq(chatThread.id, threadId), eq(chatThread.user_id, userId)))
  return thread ?? null
}

/**
 * Atomically claims a thread for one response run and returns it with its
 * stored run state. Returns null when the thread doesn't exist, isn't owned
 * by the user, OR is already claimed by an in-flight run — callers
 * disambiguate via getThread. Prevents concurrent sends from running the
 * agent off the same previous run_state and clobbering each other's save.
 */
export async function claimThreadRun(params: {
  userId: string
  threadId: string
  claimUntil: Date
}) {
  const [thread] = await db
    .update(chatThread)
    .set({ run_claimed_until: params.claimUntil })
    .where(
      and(
        eq(chatThread.id, params.threadId),
        eq(chatThread.user_id, params.userId),
        or(
          isNull(chatThread.run_claimed_until),
          lt(chatThread.run_claimed_until, sql`now()`),
        ),
      ),
    )
    .returning({
      id: chatThread.id,
      title: chatThread.title,
      run_state: chatThread.run_state,
    })
  return thread ?? null
}

export async function renameThread(
  userId: string,
  threadId: string,
  title: string,
) {
  const [thread] = await db
    .update(chatThread)
    .set({ title })
    .where(and(eq(chatThread.id, threadId), eq(chatThread.user_id, userId)))
    .returning({
      id: chatThread.id,
      title: chatThread.title,
      model: chatThread.model,
      created_at: chatThread.created_at,
      updated_at: chatThread.updated_at,
    })
  return thread ?? null
}

export async function deleteThread(userId: string, threadId: string) {
  const deleted = await db
    .delete(chatThread)
    .where(and(eq(chatThread.id, threadId), eq(chatThread.user_id, userId)))
    .returning({ id: chatThread.id })
  return deleted.length > 0
}

export async function touchThread(params: {
  threadId: string
  model: string
  /** New serialized RunState; omit to leave the stored state untouched. */
  runState?: unknown
}) {
  await db
    .update(chatThread)
    .set({
      updated_at: sql`now()`,
      model: params.model,
      // The run is over either way; release the claim.
      run_claimed_until: null,
      ...(params.runState !== undefined ? { run_state: params.runState } : {}),
    })
    .where(eq(chatThread.id, params.threadId))
}

export async function listMessages(threadId: string) {
  // Most recent messages, returned in chronological order. The cap keeps a
  // very long thread from producing an unbounded response payload.
  const rows = await db
    .select({
      id: chatMessage.id,
      role: chatMessage.role,
      content: chatMessage.content,
      blocks: chatMessage.blocks,
      model: chatMessage.model,
      created_at: chatMessage.created_at,
    })
    .from(chatMessage)
    .where(eq(chatMessage.thread_id, threadId))
    .orderBy(desc(chatMessage.created_at), desc(chatMessage.id))
    .limit(500)
  return rows.reverse()
}

export async function insertMessage(params: {
  threadId: string
  userId: string
  role: ChatRole
  content: string
  /** Block tree for assistant turns with subagent activity. */
  blocks?: unknown
  model?: string
}) {
  const [message] = await db
    .insert(chatMessage)
    .values({
      thread_id: params.threadId,
      user_id: params.userId,
      role: params.role,
      content: params.content,
      blocks: params.blocks,
      model: params.model,
    })
    .returning()
  return message
}

/**
 * Records one accepted user message in the append-only usage ledger and
 * returns the user's usage over both rate-limit windows INCLUDING the new
 * event. Insert-then-count keeps concurrent requests honest (each sees the
 * others' inserts), and the ledger survives thread deletion — counting
 * chat_message rows instead would let users reset their quota by deleting
 * threads (messages cascade away with the thread).
 */
export async function recordUsageAndCount(params: {
  userId: string
  shortWindowStart: Date
  longWindowStart: Date
}) {
  await db.insert(chatUsageEvent).values({ user_id: params.userId })
  const [row] = await db
    .select({
      // Raw sql params skip the column's Date mapping, so pass an ISO string.
      shortWindow: count(
        sql`case when ${chatUsageEvent.created_at} > ${params.shortWindowStart.toISOString()}::timestamptz then 1 end`,
      ),
      longWindow: count(),
    })
    .from(chatUsageEvent)
    .where(
      and(
        eq(chatUsageEvent.user_id, params.userId),
        gt(chatUsageEvent.created_at, params.longWindowStart),
      ),
    )
  return {
    shortWindow: row?.shortWindow ?? 0,
    longWindow: row?.longWindow ?? 0,
  }
}

/** Releases a run claim without touching anything else (e.g. when the
 *  rate limiter rejects the request after the thread was claimed). */
export async function releaseThreadRun(threadId: string) {
  await db
    .update(chatThread)
    .set({ run_claimed_until: null })
    .where(eq(chatThread.id, threadId))
}

export async function isUserBanned(userId: string) {
  const [row] = await db
    .select({ banned: user.banned })
    .from(user)
    .where(eq(user.id, userId))
  return row?.banned ?? false
}
