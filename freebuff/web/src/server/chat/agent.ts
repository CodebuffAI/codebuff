import { getCachedFreebuffWebServiceAccountApiKey } from '@codebuff/internal/freebuff/web-service-account'

import type { ChatImageRef } from './store'
import type { AgentDefinition, MessageContent, RunState } from '@codebuff/sdk'

import baseChatAgent from '../../../../../agents/base-chat'
import researcherWebAgent from '../../../../../agents/researcher/researcher-web'
import thinkerGeminiAgent from '../../../../../agents/thinker/thinker-gemini'
import { CHAT_MODELS } from '@/app/chat/models'
import { getBlobStore } from '@/server/chat/blob-store'
import { logger } from '@/util/logger'

import { toolCallDisplay } from '@/app/chat/blocks'

import type { ChatStreamEvent, SuggestedFollowup } from '@/app/chat/blocks'

type SdkModule = typeof import('@codebuff/sdk')

let sdkPromise: Promise<SdkModule> | null = null

/** The SDK ships WASM modules bundlers can't process, and Next refuses to
 *  externalize symlinked workspace packages — so load it at runtime from
 *  node_modules, hidden from both bundlers. */
function loadSdk(): Promise<SdkModule> {
  sdkPromise ??= import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ '@codebuff/sdk'
  )
  return sdkPromise
}

/** The service-account PAT is read from the shared DB (cached in
 *  @codebuff/internal) so it never has to be distributed through this
 *  server's environment. An explicit CODEBUFF_API_KEY (local dev,
 *  emergencies) overrides the lookup. */
async function getChatApiKey(): Promise<string> {
  const envKey = process.env.CODEBUFF_API_KEY
  if (envKey) {
    return envKey
  }
  const key = await getCachedFreebuffWebServiceAccountApiKey()
  if (!key) {
    throw new Error(
      'No Freebuff Web service account credential found. Provision one with scripts/create-freebuff-web-service-account.ts or set CODEBUFF_API_KEY.',
    )
  }
  return key
}

export interface ChatAgentResult {
  /** Serialized run state to persist for the next turn; null if the run
   *  aborted before producing a new state worth keeping. */
  runState: RunState | null
  errorMessage: string | null
}

/** Spawn/flow-control tool calls that would be noise in the chat UI. */
const HIDDEN_TOOL_NAMES = new Set([
  'spawn_agents',
  'spawn_agent_inline',
  'end_turn',
  'set_output',
  'set_messages',
  'add_message',
])

/** Pulls the validated followups out of a suggest_followups tool call. Drops
 *  any entry without a non-empty prompt; trims the prompt and optional label. */
function parseSuggestedFollowups(
  input: Record<string, unknown>,
): SuggestedFollowup[] {
  const raw = (input as { followups?: unknown }).followups
  const items = Array.isArray(raw) ? raw : raw ? [raw] : []
  const followups: SuggestedFollowup[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const { prompt, label } = item as Record<string, unknown>
    if (typeof prompt !== 'string' || !prompt.trim()) continue
    followups.push({
      prompt: prompt.trim(),
      ...(typeof label === 'string' && label.trim()
        ? { label: label.trim() }
        : {}),
    })
  }
  return followups
}

/**
 * Resolves each attachment's storageId to a serving URL via the blob store,
 * then fetches and base64-encodes it for the multimodal `content` array the SDK
 * expects. URLs come from our own blob store (never from the client), so there
 * is no SSRF surface. Images that can't be resolved or fetched are skipped
 * rather than failing the whole turn.
 */
async function buildImageContent(
  images: ChatImageRef[],
  signal: AbortSignal,
): Promise<MessageContent[]> {
  const urls = await getBlobStore().getUrls(images.map((img) => img.storageId))
  const parts = await Promise.all(
    images.map(async (img): Promise<MessageContent | null> => {
      const url = urls[img.storageId]
      if (!url) {
        logger.warn(
          { storageId: img.storageId },
          'Chat image blob missing; sending message without it',
        )
        return null
      }
      try {
        const res = await fetch(url, { signal })
        if (!res.ok) {
          throw new Error(`status ${res.status}`)
        }
        const base64 = Buffer.from(await res.arrayBuffer()).toString('base64')
        return { type: 'image', image: base64, mediaType: img.mediaType }
      } catch (error) {
        if (!signal.aborted) {
          logger.error(
            { error, storageId: img.storageId },
            'Chat image fetch failed; sending message without it',
          )
        }
        return null
      }
    }),
  )
  const resolved = parts.filter((p): p is MessageContent => p !== null)
  // Make the happy path observable: how many images actually made it into the
  // request, their byte sizes and media types. A 78-byte image here next to a
  // downstream "failed to decode image" provider error means the image is
  // degenerate/malformed, not that the pipeline dropped it.
  logger.info(
    { ...summarizeChatImages(resolved), requested: images.length },
    'Chat image attachments resolved',
  )
  return resolved
}

/** PII-safe summary of resolved image parts: counts, byte sizes, and media
 *  types — never the raw image content itself. */
function summarizeChatImages(parts: MessageContent[]): {
  imageCount: number
  imageBytes: number[]
  mediaTypes: string[]
} {
  const imageParts = parts.filter(
    (p): p is Extract<MessageContent, { type: 'image' }> => p.type === 'image',
  )
  return {
    imageCount: imageParts.length,
    // base64 length × ¾ ≈ decoded byte count.
    imageBytes: imageParts.map((p) => Math.floor((p.image?.length ?? 0) * 0.75)),
    mediaTypes: [...new Set(imageParts.map((p) => p.mediaType))],
  }
}

/**
 * Runs one turn of the base-chat agent through the codebuff agent framework.
 * LLM calls flow through the shared /api/v1/chat/completions endpoint under
 * the freebuff web service account (metered, not deducted). The agent has no
 * filesystem and no direct tools, but can spawn researcher-web; subagent
 * lifecycle/tool events are forwarded through `onEvent`.
 */
export async function runChatAgent(params: {
  prompt: string
  /** Chat-product model id, chosen by the caller (see stream route). */
  model: string
  /** Image attachments for this turn; already validated by the caller. */
  images?: ChatImageRef[]
  previousRunState: unknown
  userId: string
  threadId: string
  signal: AbortSignal
  /** Normalized stream of root text deltas and subagent activity. */
  onEvent: (event: ChatStreamEvent) => void
}): Promise<ChatAgentResult> {
  const [apiKey, { run }] = await Promise.all([getChatApiKey(), loadSdk()])

  const backendModel = CHAT_MODELS.find((m) => m.id === params.model)?.backendId
  if (!backendModel) {
    throw new Error(`Unknown chat model: ${params.model}`)
  }

  const content = params.images?.length
    ? await buildImageContent(params.images, params.signal)
    : undefined

  const agent = {
    ...baseChatAgent,
    model: backendModel,
  } as AgentDefinition

  const previousRun =
    params.previousRunState &&
    typeof params.previousRunState === 'object' &&
    'sessionState' in params.previousRunState
      ? (params.previousRunState as RunState)
      : undefined

  // Track what we've forwarded so tool events from the root agent (or for
  // hidden tools) never reach the client.
  const subagentIds = new Set<string>()
  const forwardedToolCallIds = new Set<string>()

  const runState = await run({
    apiKey,
    fingerprintId: `freebuff-chat-${params.userId}`,
    // run() registers an inline agent definition itself; no need to also
    // pass it via agentDefinitions.
    agent,
    agentDefinitions: [
      researcherWebAgent as AgentDefinition,
      thinkerGeminiAgent as AgentDefinition,
    ],
    // No filesystem: skip project discovery entirely.
    projectFiles: {},
    knowledgeFiles: {},
    maxAgentSteps: 10,
    prompt: params.prompt,
    ...(content && content.length > 0 ? { content } : {}),
    previousRun,
    costMode: 'normal',
    signal: params.signal,
    extraCodebuffMetadata: {
      freebuff_chat_user_id: params.userId,
      freebuff_chat_thread_id: params.threadId,
    },
    handleStreamChunk: (chunk) => {
      if (typeof chunk === 'string') {
        params.onEvent({ type: 'delta', text: chunk })
      } else if (chunk.type === 'subagent_chunk') {
        params.onEvent({
          type: 'agent_delta',
          agentId: chunk.agentId,
          text: chunk.chunk,
        })
      } else if (chunk.type === 'reasoning_chunk') {
        // Empty ancestorRunIds = the root agent itself is thinking.
        if (chunk.ancestorRunIds.length === 0) {
          params.onEvent({ type: 'reasoning_delta', text: chunk.chunk })
        } else {
          params.onEvent({
            type: 'agent_reasoning_delta',
            agentId: chunk.agentId,
            text: chunk.chunk,
          })
        }
      }
    },
    handleEvent: (event) => {
      if (event.type === 'subagent_start') {
        subagentIds.add(event.agentId)
        params.onEvent({
          type: 'agent_start',
          agentId: event.agentId,
          parentAgentId: event.parentAgentId,
          name: event.displayName,
          agentType: event.agentType,
          prompt: event.prompt,
        })
      } else if (event.type === 'subagent_finish') {
        params.onEvent({ type: 'agent_finish', agentId: event.agentId })
      } else if (event.type === 'tool_call') {
        if (HIDDEN_TOOL_NAMES.has(event.toolName)) {
          return
        }
        // suggest_followups drives a dedicated UI (clickable followup cards),
        // not a generic tool row — normalize it into a `suggestions` event and
        // don't track it for tool_result forwarding.
        if (event.toolName === 'suggest_followups') {
          const followups = parseSuggestedFollowups(event.input)
          if (followups.length > 0) {
            params.onEvent({
              type: 'suggestions',
              toolCallId: event.toolCallId,
              followups,
            })
          }
          return
        }
        // Tool calls carry the calling agent's id; anything not tracked as a
        // subagent is the root agent, whose calls (e.g. gravity_index) render
        // as top-level rows — agent_tool without an agentId.
        const subagentId =
          event.agentId && subagentIds.has(event.agentId)
            ? event.agentId
            : undefined
        forwardedToolCallIds.add(event.toolCallId)
        const { label, verbs } = toolCallDisplay(event.toolName, event.input)
        params.onEvent({
          type: 'agent_tool',
          ...(subagentId ? { agentId: subagentId } : {}),
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          label,
          ...(verbs ? { verbs } : {}),
        })
      } else if (event.type === 'tool_result') {
        if (!forwardedToolCallIds.has(event.toolCallId)) return
        params.onEvent({
          type: 'agent_tool_done',
          toolCallId: event.toolCallId,
        })
      }
    },
  })

  if (runState.output.type === 'error') {
    const aborted = params.signal.aborted
    if (!aborted) {
      logger.error(
        {
          userId: params.userId,
          threadId: params.threadId,
          message: runState.output.message,
          model: backendModel,
          // Image sizes/types on the failure itself, so an image-request
          // failure is self-describing. Computed only here, on the error path.
          ...(content ? summarizeChatImages(content) : {}),
        },
        'Chat agent run failed',
      )
    }
    return {
      // An errored/aborted run's session state doesn't include this turn;
      // keep the previous state so history stays consistent.
      runState: null,
      errorMessage: aborted ? null : runState.output.message,
    }
  }

  return { runState, errorMessage: null }
}
