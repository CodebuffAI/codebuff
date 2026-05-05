import { deepseekModels } from '@codebuff/common/constants/model-config'

import type { ChatCompletionRequestBody } from './types'

export const DEEPSEEK_MODEL_IDS: Record<string, string> = {
  [deepseekModels.deepseekV4ProDirect]: deepseekModels.deepseekV4ProDirect,
  [deepseekModels.deepseekV4Pro]: deepseekModels.deepseekV4ProDirect,
}

export function getDeepSeekModelId(openrouterModel: string): string {
  return DEEPSEEK_MODEL_IDS[openrouterModel] ?? openrouterModel
}

function toDeepSeekReasoningEffort(effort: unknown): 'high' | 'max' {
  return effort === 'max' || effort === 'xhigh' ? 'max' : 'high'
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

export function normalizeDeepSeekRequestBody(
  body: ChatCompletionRequestBody,
  originalModel: string = body.model,
): ChatCompletionRequestBody {
  const messages = Array.isArray(body.messages)
    ? body.messages.map((message) => ({
        ...message,
        content:
          message.content === undefined || message.content === null
            ? message.content
            : contentPartsToDeepSeekText(message.content),
      }))
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
