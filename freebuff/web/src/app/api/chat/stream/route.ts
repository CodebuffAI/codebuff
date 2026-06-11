import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

import { BlockTreeBuilder } from '@/app/chat/blocks'
import {
  CHAT_MESSAGE_MAX_CHARS,
  deriveThreadTitle,
  isChatModelId,
  resolveChatModel,
} from '@/app/chat/models'
import { getChatAccessTier } from '@/server/chat/access'
import { runChatAgent } from '@/server/chat/agent'
import { getChatUserId } from '@/server/chat/auth'
import { CHAT_DISABLED, chatDisabledResponse } from '@/server/chat/disabled'
import { consumeChatRateLimit } from '@/server/chat/limits'
import {
  claimThreadRun,
  createThread,
  getThread,
  insertMessage,
  isUserBanned,
  releaseThreadRun,
  touchThread,
} from '@/server/chat/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// How long a thread stays claimed by one response run. Longer than
// maxDuration so a live run is never stolen; short enough that a crashed
// server doesn't lock the thread for long.
const RUN_CLAIM_MS = 6 * 60 * 1000

// Generous bound for a 32k-char message wrapped in JSON; rejects oversized
// bodies from Content-Length before parsing them.
const MAX_BODY_BYTES = 256 * 1024

const sseTextEncoder = new TextEncoder()

function sseEncode(payload: unknown): Uint8Array {
  return sseTextEncoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
}

export async function POST(request: NextRequest) {
  if (CHAT_DISABLED) {
    return chatDisabledResponse()
  }
  const userId = await getChatUserId()
  if (!userId) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Please sign in to chat.' },
      { status: 401 },
    )
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        error: 'message_too_long',
        message: `Messages are limited to ${CHAT_MESSAGE_MAX_CHARS.toLocaleString()} characters.`,
      },
      { status: 413 },
    )
  }

  const body = await request.json().catch(() => null)
  const content = typeof body?.content === 'string' ? body.content.trim() : ''
  const requestedModel = typeof body?.model === 'string' ? body.model : ''
  const threadIdInput =
    typeof body?.threadId === 'string' ? body.threadId : null

  if (!content) {
    return NextResponse.json(
      { error: 'empty_message', message: 'Message cannot be empty.' },
      { status: 400 },
    )
  }
  if (content.length > CHAT_MESSAGE_MAX_CHARS) {
    return NextResponse.json(
      {
        error: 'message_too_long',
        message: `Messages are limited to ${CHAT_MESSAGE_MAX_CHARS.toLocaleString()} characters.`,
      },
      { status: 400 },
    )
  }
  if (!isChatModelId(requestedModel)) {
    return NextResponse.json(
      { error: 'invalid_model', message: 'Unknown model.' },
      { status: 400 },
    )
  }

  // Claim the thread (one in-flight response per thread — concurrent runs
  // would clobber each other's run_state) in parallel with the tier check
  // (usually a cached DB read) and the ban check. The chat runs under the
  // service account, so the platform's own ban enforcement never sees the
  // real user — check it here.
  const claimUntil = new Date(Date.now() + RUN_CLAIM_MS)
  const [accessTier, claimedThread, banned] = await Promise.all([
    getChatAccessTier(userId, request),
    threadIdInput
      ? claimThreadRun({ userId, threadId: threadIdInput, claimUntil })
      : null,
    isUserBanned(userId),
  ])

  if (banned) {
    if (claimedThread) {
      await releaseThreadRun(claimedThread.id)
    }
    return NextResponse.json(
      { error: 'forbidden', message: 'Your account has been suspended.' },
      { status: 403 },
    )
  }

  if (threadIdInput && !claimedThread) {
    const exists = await getThread(userId, threadIdInput)
    if (!exists) {
      return NextResponse.json(
        { error: 'thread_not_found', message: 'Chat not found.' },
        { status: 404 },
      )
    }
    return NextResponse.json(
      {
        error: 'response_in_progress',
        message: 'A response is already being generated in this chat.',
      },
      { status: 409 },
    )
  }

  // Consume quota only after the claim succeeded, so busy/missing threads
  // don't burn it. The ledger is append-only (insert-then-count), so the
  // limit holds under concurrency and survives thread deletion.
  const rateLimit = await consumeChatRateLimit(userId)
  if (!rateLimit.allowed) {
    if (claimedThread) {
      await releaseThreadRun(claimedThread.id)
    }
    return NextResponse.json(
      { error: 'rate_limited', message: rateLimit.message },
      { status: 429 },
    )
  }

  const model = resolveChatModel(accessTier, requestedModel)

  const thread =
    claimedThread ??
    (await createThread({
      userId,
      title: deriveThreadTitle(content),
      model,
      runClaimedUntil: claimUntil,
    }))
  const threadId = thread.id
  const previousRunState = thread.run_state

  await insertMessage({ threadId, userId, role: 'user', content })

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        sseEncode({ type: 'meta', threadId, title: thread.title }),
      )
      let runState: unknown
      // Mirrors the client's tree so subagent activity survives reloads
      // (and client disconnects) via chat_message.blocks.
      const blockTree = new BlockTreeBuilder()
      const enqueueGenericError = () => {
        try {
          controller.enqueue(
            sseEncode({
              type: 'error',
              message:
                'Something went wrong generating a response. Please try again.',
            }),
          )
        } catch {
          // Stream already closed.
        }
      }
      try {
        const result = await runChatAgent({
          prompt: content,
          model,
          previousRunState,
          userId,
          threadId,
          signal: request.signal,
          onEvent: (event) => {
            blockTree.apply(event)
            try {
              controller.enqueue(sseEncode(event))
            } catch {
              // Client disconnected; keep accumulating so we can persist.
            }
          },
        })
        runState = result.runState ?? undefined
        if (result.errorMessage) {
          enqueueGenericError()
        }
      } catch (error) {
        const aborted = error instanceof Error && error.name === 'AbortError'
        if (!aborted) {
          console.error('[chat/stream] agent run failed:', error)
          enqueueGenericError()
        }
      }
      const assistantText = blockTree.rootText
      if (assistantText.length > 0 || blockTree.hasAgentBlocks) {
        // Note: on an errored/aborted run, runState stays at the previous
        // turn, so this partial text is visible in the transcript but absent
        // from the agent's replayed history. chat_message is the UI's source
        // of truth; run_state is the agent's.
        blockTree.finalize()
        await insertMessage({
          threadId,
          userId,
          role: 'assistant',
          content: assistantText,
          // Plain-text turns skip the column; the UI falls back to content.
          blocks: blockTree.hasAgentBlocks ? blockTree.blocks : undefined,
          model,
        })
      }
      // Also releases the thread's run claim.
      await touchThread({ threadId, model, runState })
      try {
        controller.enqueue(sseEncode({ type: 'done' }))
        controller.close()
      } catch {
        // Stream already closed (client disconnected).
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
