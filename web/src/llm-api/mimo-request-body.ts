import { mimoModels } from '@codebuff/common/constants/model-config'

import type {
  ChatCompletionContentPart,
  ChatCompletionRequestBody,
} from './types'

type MiMoMessageContent = NonNullable<
  ChatCompletionRequestBody['messages'][number]['content']
>

type MiMoCompatibleContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export const MIMO_MODEL_IDS: Record<string, string> = {
  [mimoModels.mimoV25Direct]: mimoModels.mimoV25Direct,
  [mimoModels.mimoV25]: mimoModels.mimoV25Direct,
  [mimoModels.mimoV25ProDirect]: mimoModels.mimoV25ProDirect,
  [mimoModels.mimoV25Pro]: mimoModels.mimoV25ProDirect,
}

export function getMiMoModelId(openrouterModel: string): string {
  return MIMO_MODEL_IDS[openrouterModel] ?? openrouterModel
}

/** Only MiMo 2.5 is multimodal; MiMo 2.5 Pro does not accept image input, and
 *  sending it an image errors. We strip images for unsupported models and leave
 *  a note rather than failing the whole request. Allowlist by design: a new
 *  MiMo model is treated as text-only until it is explicitly added here, so we
 *  never silently send images to a model that can't handle them. */
export function mimoModelSupportsImages(model: string): boolean {
  return getMiMoModelId(model) === mimoModels.mimoV25Direct
}

function toMiMoReasoningEffort(effort: unknown): 'high' | 'max' {
  return effort === 'max' || effort === 'xhigh' ? 'max' : 'high'
}

function unsupportedAttachmentNotice(kind: string, count: number): string {
  const noun = count === 1 ? kind : `${kind}s`
  const verb = count === 1 ? 'was' : 'were'
  return `[${count} ${noun} ${verb} omitted because the MiMo API does not support ${kind} input.]`
}

function getImageUrl(part: ChatCompletionContentPart): string | undefined {
  const imageUrl = (part as Record<string, unknown>).image_url
  if (typeof imageUrl === 'string') {
    return imageUrl.length > 0 ? imageUrl : undefined
  }
  if (
    imageUrl &&
    typeof imageUrl === 'object' &&
    typeof (imageUrl as Record<string, unknown>).url === 'string'
  ) {
    const url = (imageUrl as Record<string, unknown>).url as string
    return url.length > 0 ? url : undefined
  }

  return undefined
}

function contentPartsToMiMoContent(
  content: MiMoMessageContent,
  supportsImages: boolean,
): MiMoMessageContent {
  if (!Array.isArray(content)) {
    return content
  }

  const textParts: string[] = []
  const compatibleParts: MiMoCompatibleContentPart[] = []
  let imageCount = 0
  let fileCount = 0
  let unsupportedCount = 0

  for (const part of content) {
    switch (part.type) {
      case 'text': {
        if (typeof part.text === 'string' && part.text.length > 0) {
          textParts.push(part.text)
          compatibleParts.push({ type: 'text', text: part.text })
        }
        break
      }
      case 'image_url': {
        // Drop the image when the model can't take one (or the url is empty);
        // it's reported as an omitted image either way.
        const url = getImageUrl(part)
        if (url && supportsImages) {
          compatibleParts.push({ type: 'image_url', image_url: { url } })
        } else {
          imageCount += 1
        }
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

  const notices: string[] = []
  if (imageCount > 0) {
    notices.push(unsupportedAttachmentNotice('image', imageCount))
  }
  if (fileCount > 0) {
    notices.push(unsupportedAttachmentNotice('file', fileCount))
  }
  if (unsupportedCount > 0) {
    notices.push(
      unsupportedAttachmentNotice('unsupported content part', unsupportedCount),
    )
  }

  if (compatibleParts.some((part) => part.type === 'image_url')) {
    compatibleParts.push(
      ...notices.map((text) => ({ type: 'text' as const, text })),
    )
    return compatibleParts
  }

  textParts.push(...notices)
  return textParts.join('\n\n')
}

export function normalizeMiMoRequestBody(
  body: ChatCompletionRequestBody,
  originalModel: string = body.model,
): ChatCompletionRequestBody {
  const supportsImages = mimoModelSupportsImages(originalModel)
  const messages = Array.isArray(body.messages)
    ? body.messages.map((message) => ({
        ...message,
        content:
          message.content === undefined || message.content === null
            ? message.content
            : contentPartsToMiMoContent(message.content, supportsImages),
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
