import { deepseekModels } from '@codebuff/common/constants/model-config'

import type { ChatCompletionRequestBody } from './types'

export const DEEPSEEK_MODEL_IDS: Record<string, string> = {
  [deepseekModels.deepseekV4ProDirect]: deepseekModels.deepseekV4ProDirect,
  [deepseekModels.deepseekV4Pro]: deepseekModels.deepseekV4ProDirect,
  [deepseekModels.deepseekV4FlashDirect]: deepseekModels.deepseekV4FlashDirect,
  [deepseekModels.deepseekV4Flash]: deepseekModels.deepseekV4FlashDirect,
}

export function getDeepSeekModelId(openrouterModel: string): string {
  return DEEPSEEK_MODEL_IDS[openrouterModel] ?? openrouterModel
}

function toDeepSeekReasoningEffort(effort: unknown): 'high' | 'max' {
  return effort === 'max' || effort === 'xhigh' ? 'max' : 'high'
}

const DEEPSEEK_TOOL_CHOICE_STRINGS = new Set(['none', 'auto', 'required'])

/**
 * DeepSeek's `tool_choice` only accepts the strings "none" | "auto" |
 * "required" or `{"type": "function", "function": {"name": ...}}`. The
 * OpenRouter-style object form `{"type": "auto"}` fails deserialization with a
 * 400 ("unknown variant `auto`, expected `function`"), and thinking mode
 * rejects any explicit tool_choice ("Thinking mode does not support this
 * tool_choice"). Thinking is ON by default for the V4 models, so the field is
 * dropped unless `thinking` is explicitly disabled.
 */
function normalizeDeepSeekToolChoice(
  deepseekBody: Record<string, unknown>,
): void {
  const toolChoice = deepseekBody.tool_choice
  if (toolChoice === undefined) {
    return
  }

  const thinking = deepseekBody.thinking as { type?: string } | undefined
  if (thinking?.type !== 'disabled') {
    delete deepseekBody.tool_choice
    return
  }

  if (typeof toolChoice === 'string') {
    if (!DEEPSEEK_TOOL_CHOICE_STRINGS.has(toolChoice)) {
      delete deepseekBody.tool_choice
    }
    return
  }

  if (toolChoice !== null && typeof toolChoice === 'object') {
    const type = (toolChoice as { type?: unknown }).type
    if (type === 'function') {
      return
    }
    if (typeof type === 'string' && DEEPSEEK_TOOL_CHOICE_STRINGS.has(type)) {
      deepseekBody.tool_choice = type
      return
    }
  }

  delete deepseekBody.tool_choice
}

function unsupportedAttachmentNotice(kind: string, count: number): string {
  const noun = count === 1 ? kind : `${kind}s`
  const verb = count === 1 ? 'was' : 'were'
  return `[${count} ${noun} ${verb} omitted because the DeepSeek API does not support ${kind} input.]`
}

function contentPartsToDeepSeekText(
  content: NonNullable<
    ChatCompletionRequestBody['messages'][number]['content']
  >,
): string {
  if (!Array.isArray(content)) {
    return content
  }

  const textParts: string[] = []
  let imageCount = 0
  let fileCount = 0
  let unsupportedCount = 0

  for (const part of content) {
    switch (part.type) {
      case 'text': {
        if (typeof part.text === 'string' && part.text.length > 0) {
          textParts.push(part.text)
        }
        break
      }
      case 'image_url': {
        imageCount += 1
        break
      }
      case 'file': {
        fileCount += 1
        break
      }
      default: {
        unsupportedCount += 1
        break
      }
    }
  }

  if (imageCount > 0) {
    textParts.push(unsupportedAttachmentNotice('image', imageCount))
  }
  if (fileCount > 0) {
    textParts.push(unsupportedAttachmentNotice('file', fileCount))
  }
  if (unsupportedCount > 0) {
    textParts.push(
      unsupportedAttachmentNotice('unsupported content part', unsupportedCount),
    )
  }

  return textParts.join('\n\n')
}

type DeepSeekChatMessage = ChatCompletionRequestBody['messages'][number] & {
  reasoning_content?: string | null
}

/**
 * Make the message history satisfy DeepSeek's thinking-mode replay validation.
 *
 * Thinking mode is ON by default for the V4 models, and it validates the
 * tool-call loop: every assistant message carrying `tool_calls` that sits
 * after the LAST user message must itself carry a `reasoning_content` key —
 * reasoning in a separate adjacent assistant message does not count, and a
 * missing key fails the whole request with a 400:
 *   "The `reasoning_content` in the thinking mode must be passed back to the API."
 * An empty-string `reasoning_content` is accepted, and the key is also
 * accepted when thinking is disabled, so this normalization is safe to apply
 * unconditionally. (All verified against the live API, 2026-07-01.)
 *
 * Clients (including older Codebuff CLIs) may send a step's reasoning as its
 * own assistant message before the tool-call one, or drop it entirely, so:
 *  1. merge runs of consecutive assistant messages into a single message —
 *     content / reasoning_content / tool_calls concatenated in order, which
 *     mirrors how the SDK's message converter merges content parts; and
 *  2. backfill `reasoning_content: ''` on any assistant tool-call message
 *     after the last user message that still lacks it.
 */
export function normalizeDeepSeekAssistantReasoning(
  messages: ChatCompletionRequestBody['messages'],
): ChatCompletionRequestBody['messages'] {
  const merged: DeepSeekChatMessage[] = []
  for (const original of messages as DeepSeekChatMessage[]) {
    const last = merged[merged.length - 1]
    if (original.role !== 'assistant' || last?.role !== 'assistant') {
      merged.push({ ...original })
      continue
    }
    if (typeof original.content === 'string' && original.content.length > 0) {
      last.content =
        typeof last.content === 'string'
          ? last.content + original.content
          : original.content
    }
    if (
      typeof original.reasoning_content === 'string' &&
      original.reasoning_content.length > 0
    ) {
      last.reasoning_content =
        typeof last.reasoning_content === 'string'
          ? last.reasoning_content + original.reasoning_content
          : original.reasoning_content
    }
    if (original.tool_calls?.length) {
      last.tool_calls = [...(last.tool_calls ?? []), ...original.tool_calls]
    }
    // Carry any other fields (name, cache_control, …) with later-wins
    // precedence so merging drops nothing a non-merged message would keep.
    const { role, content, reasoning_content, tool_calls, ...rest } = original
    Object.assign(last, rest)
  }

  const lastUserIndex = merged.findLastIndex((m) => m.role === 'user')
  for (let i = lastUserIndex + 1; i < merged.length; i++) {
    const message = merged[i]
    if (
      message.role === 'assistant' &&
      message.tool_calls?.length &&
      typeof message.reasoning_content !== 'string'
    ) {
      message.reasoning_content = ''
    }
  }

  return merged
}

export function normalizeDeepSeekRequestBody(
  body: ChatCompletionRequestBody,
  originalModel: string = body.model,
): ChatCompletionRequestBody {
  const messages = Array.isArray(body.messages)
    ? normalizeDeepSeekAssistantReasoning(
        body.messages.map((message) => ({
          ...message,
          content:
            message.content === undefined || message.content === null
              ? message.content
              : contentPartsToDeepSeekText(message.content),
        })),
      )
    : body.messages

  return {
    ...body,
    model: getDeepSeekModelId(originalModel),
    messages,
  }
}

export function buildDeepSeekRequestBody(
  body: ChatCompletionRequestBody,
  originalModel: string = body.model,
): Record<string, unknown> {
  const deepseekBody = normalizeDeepSeekRequestBody(
    body,
    originalModel,
  ) as unknown as Record<string, unknown>

  // DeepSeek uses `thinking` instead of OpenRouter's `reasoning`.
  if (deepseekBody.reasoning && typeof deepseekBody.reasoning === 'object') {
    const reasoning = deepseekBody.reasoning as {
      enabled?: boolean
      effort?: 'high' | 'medium' | 'low'
    }
    deepseekBody.thinking = {
      type: reasoning.enabled === false ? 'disabled' : 'enabled',
      reasoning_effort: toDeepSeekReasoningEffort(reasoning.effort),
    }
  } else if (deepseekBody.reasoning_effort) {
    deepseekBody.thinking = {
      type: 'enabled',
      reasoning_effort: toDeepSeekReasoningEffort(
        deepseekBody.reasoning_effort,
      ),
    }
  }
  delete deepseekBody.reasoning
  delete deepseekBody.reasoning_effort

  normalizeDeepSeekToolChoice(deepseekBody)

  // Strip OpenRouter-specific / internal fields.
  delete deepseekBody.provider
  delete deepseekBody.transforms
  delete deepseekBody.codebuff_metadata
  delete deepseekBody.usage

  // For streaming, request usage in the final chunk.
  if (deepseekBody.stream) {
    deepseekBody.stream_options = { include_usage: true }
  }

  return deepseekBody
}
