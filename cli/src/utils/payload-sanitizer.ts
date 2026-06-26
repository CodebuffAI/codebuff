const CHAT_STATE_MAX_STRING_LENGTH = 8_000
const DEBUG_LOG_MAX_STRING_LENGTH = 8_000
const DEBUG_LOG_MAX_ARRAY_LENGTH = 120
const DEBUG_LOG_MAX_OBJECT_KEYS = 160

// Keys whose string values are credentials (OAuth tokens, API keys, bearer
// auth headers). When sanitizing an object, any value under a matching key is
// replaced with '[REDACTED]' so tokens never reach the debug log
// (debug/cli.jsonl) or persisted chat state. Matching is case-insensitive and
// catches common casing variants (accessToken, access_token, ACCESS_TOKEN).
const SENSITIVE_KEY_PATTERN =
  /^(.*(?:token|access_token|refresh_token|id_token|authorization|api[_-]?key|apikey|secret|bearer|password|passwd|credential).*)$/i

const isSensitiveKey = (key: string): boolean =>
  SENSITIVE_KEY_PATTERN.test(key)

type SanitizeOptions = {
  maxStringLength: number
  maxArrayLength?: number
  maxObjectKeys?: number
  purpose: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const byteLengthOfBinary = (value: ArrayBuffer | ArrayBufferView): number =>
  value instanceof ArrayBuffer ? value.byteLength : value.byteLength

const truncateString = (value: string, options: SanitizeOptions): string => {
  if (value.length <= options.maxStringLength) {
    return value
  }

  const omitted = value.length - options.maxStringLength
  return `${value.slice(0, options.maxStringLength)}\n\n[Openbuff truncated ${omitted} chars while ${options.purpose}. Re-run the tool if the full output is needed.]`
}

const omittedMediaText = (params: {
  kind: 'file' | 'image' | 'media'
  mediaType?: unknown
  length: number
}): string => {
  const mediaType =
    typeof params.mediaType === 'string' ? ` ${params.mediaType}` : ''
  return `[Openbuff omitted persisted ${params.kind}${mediaType} payload (${params.length} base64 chars). Re-run read_image or reattach the image if needed.]`
}

const sanitizeObject = (
  value: Record<string, unknown>,
  options: SanitizeOptions,
  seen: WeakSet<object>,
): unknown => {
  const type = typeof value.type === 'string' ? value.type : undefined

  if (type === 'media' && typeof value.data === 'string') {
    return {
      type: 'json',
      value: {
        mediaRedacted: true,
        mediaType: value.mediaType,
        dataLength: value.data.length,
        message: omittedMediaText({
          kind: 'media',
          mediaType: value.mediaType,
          length: value.data.length,
        }),
      },
    }
  }

  if (type === 'file' && typeof value.data === 'string') {
    return {
      type: 'text',
      text: omittedMediaText({
        kind: 'file',
        mediaType: value.mediaType,
        length: value.data.length,
      }),
    }
  }

  if (type === 'image' && typeof value.image === 'string') {
    const hasChatImageMetadata =
      'filename' in value ||
      'size' in value ||
      'width' in value ||
      'height' in value ||
      'isCollapsed' in value ||
      'userOpened' in value

    if (!hasChatImageMetadata) {
      return {
        type: 'text',
        text: omittedMediaText({
          kind: 'image',
          mediaType: value.mediaType,
          length: value.image.length,
        }),
      }
    }

    const redactedImageBlock: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      redactedImageBlock[key] =
        key === 'image'
          ? ''
          : sanitizeValue(child, options, seen)
    }
    redactedImageBlock.imageRedacted = true
    redactedImageBlock.imageLength = value.image.length
    return redactedImageBlock
  }

  const entries = Object.entries(value)
  const maxObjectKeys = options.maxObjectKeys ?? entries.length
  const sanitized: Record<string, unknown> = {}

  for (const [index, [key, child]] of entries.entries()) {
    if (index >= maxObjectKeys) {
      sanitized.__openbuff_omitted_keys = entries.length - maxObjectKeys
      break
    }
    // Redact credential values by key name so OAuth tokens, API keys, and
    // bearer/authorization headers never reach the debug log or persisted
    // chat state. Objects under a sensitive key are still recursed into so
    // the *shape* (and any nested sensitive keys) is preserved, but their
    // string/URL values are replaced wholesale.
    if (isSensitiveKey(key)) {
      sanitized[key] = redactSensitiveValue(child, options, seen)
    } else {
      sanitized[key] = sanitizeValue(child, options, seen)
    }
  }

  return sanitized
}

const redactSensitiveValue = (
  value: unknown,
  options: SanitizeOptions,
  seen: WeakSet<object>,
): unknown => {
  if (typeof value === 'string') {
    return '[REDACTED]'
  }
  if (value instanceof URL) {
    return '[REDACTED]'
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return '[REDACTED]'
  }
  return sanitizeValue(value, options, seen)
}

const sanitizeArray = (
  value: unknown[],
  options: SanitizeOptions,
  seen: WeakSet<object>,
): unknown[] => {
  const maxArrayLength = options.maxArrayLength ?? value.length
  const sanitized = value
    .slice(0, maxArrayLength)
    .map((child) => sanitizeValue(child, options, seen))

  if (value.length > maxArrayLength) {
    sanitized.push(
      `[Openbuff omitted ${value.length - maxArrayLength} array items while ${options.purpose}.]`,
    )
  }

  return sanitized
}

const sanitizeValue = (
  value: unknown,
  options: SanitizeOptions,
  seen: WeakSet<object>,
): unknown => {
  if (typeof value === 'string') {
    return truncateString(value, options)
  }

  if (!isRecord(value)) {
    return value
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value instanceof URL) {
    return value.toString()
  }

  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return `[Openbuff redacted binary payload (${byteLengthOfBinary(value)} bytes) while ${options.purpose}.]`
  }

  if (seen.has(value)) {
    return '[Circular]'
  }

  seen.add(value)
  try {
    if (Array.isArray(value)) {
      return sanitizeArray(value, options, seen)
    }

    return sanitizeObject(value, options, seen)
  } finally {
    seen.delete(value)
  }
}

export function sanitizeForChatPersistence<T>(value: T): T {
  return sanitizeValue(
    value,
    {
      maxStringLength: CHAT_STATE_MAX_STRING_LENGTH,
      purpose: 'saving chat state',
    },
    new WeakSet(),
  ) as T
}

export function sanitizeForDebugLog<T>(value: T): T {
  return sanitizeValue(
    value,
    {
      maxStringLength: DEBUG_LOG_MAX_STRING_LENGTH,
      maxArrayLength: DEBUG_LOG_MAX_ARRAY_LENGTH,
      maxObjectKeys: DEBUG_LOG_MAX_OBJECT_KEYS,
      purpose: 'writing the debug log',
    },
    new WeakSet(),
  ) as T
}

export function sanitizeMediaForUiState<T>(value: T): T {
  return sanitizeValue(
    value,
    {
      maxStringLength: Number.MAX_SAFE_INTEGER,
      purpose: 'rendering tool output',
    },
    new WeakSet(),
  ) as T
}
