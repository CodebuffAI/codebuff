import type { LanguageModelV2FilePart } from '@ai-sdk/provider'

import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils'
import { isUrl } from './is-url'

export function getFileUrl({
  part,
  defaultMediaType,
}: {
  part: LanguageModelV2FilePart
  defaultMediaType: string
}) {
  if (part.data instanceof Uint8Array) {
    const base64 = convertUint8ArrayToBase64(part.data)
    return `data:${part.mediaType ?? defaultMediaType};base64,${base64}`
  }

  const stringUrl = part.data.toString()

  if (
    isUrl({
      url: stringUrl,
      protocols: new Set(['http:', 'https:']),
    })
  ) {
    return stringUrl
  }

  return stringUrl.startsWith('data:')
    ? stringUrl
    : `data:${part.mediaType ?? defaultMediaType};base64,${stringUrl}`
}
