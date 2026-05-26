import { mimoModels } from '@codebuff/common/constants/model-config'

import type { ChatCompletionRequestBody } from './types'

export const MIMO_MODEL_IDS: Record<string, string> = {
  [mimoModels.mimoV25ProDirect]: mimoModels.mimoV25ProDirect,
  [mimoModels.mimoV25Pro]: mimoModels.mimoV25ProDirect,
}

export function getMiMoModelId(openrouterModel: string): string {
  return MIMO_MODEL_IDS[openrouterModel] ?? openrouterModel
}

function toMiMoReasoningEffort(effort: unknown): 'high' | 'max' {
  return effort === 'max' || effort === 'xhigh' ? 'max' : 'high'
}

function unsupportedAttachmentNotice(kind: string, count: number): string {
  const noun = count === 1 ? kind : `${kind}s`
  const verb = count === 1 ? 'was' : 'were'
  return `[${count} ${noun} ${verb} omitted because the MiMo API does not support ${kind} input.]`
}

function contentPartsToMiMoText(
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

export function normalizeMiMoRequestBody(
  body: ChatCompletionRequestBody,
  originalModel: string = body.model,
): ChatCompletionRequestBody {
  const messages = Array.isArray(body.messages)
    ? body.messages.map((message) => ({
        ...message,
        content:
          message.content === undefined || message.content === null
            ? message.content
            : contentPartsToMiMoText(message.content),
      }))
    : body.messages

  return {
    ...body,
    model: getMiMoModelId(originalModel),
    messages,
  }
}

export function buildMiMoRequestBody(
  body: ChatCompletionRequestBody,
  originalModel: string = body.model,
): Record<string, unknown> {
  const mimoBody = normalizeMiMoRequestBody(
    body,
    originalModel,
  ) as unknown as Record<string, unknown>

  // MiMo uses `thinking` instead of OpenRouter's `reasoning`.
  if (mimoBody.reasoning && typeof mimoBody.reasoning === 'object') {
    const reasoning = mimoBody.reasoning as {
      enabled?: boolean
      effort?: 'high' | 'medium' | 'low'
    }
    mimoBody.thinking = {
      type: reasoning.enabled === false ? 'disabled' : 'enabled',
      reasoning_effort: toMiMoReasoningEffort(reasoning.effort),
    }
  } else if (mimoBody.reasoning_effort) {
    mimoBody.thinking = {
      type: 'enabled',
      reasoning_effort: toMiMoReasoningEffort(mimoBody.reasoning_effort),
    }
  }
  delete mimoBody.reasoning
  delete mimoBody.reasoning_effort

  if (
    mimoBody.max_completion_tokens === undefined &&
    mimoBody.max_tokens !== undefined
  ) {
    mimoBody.max_completion_tokens = mimoBody.max_tokens
  }
  delete mimoBody.max_tokens

  // Strip OpenRouter-specific / internal fields.
  delete mimoBody.provider
  delete mimoBody.transforms
  delete mimoBody.codebuff_metadata
  delete mimoBody.usage

  // For streaming, request usage in the final chunk.
  if (mimoBody.stream) {
    mimoBody.stream_options = { include_usage: true }
  }

  return mimoBody
}
