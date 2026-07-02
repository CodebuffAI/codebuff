function safeStringifyForError(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? 'undefined'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `[Unserializable value: ${message}]`
  }
}

export function formatValueForError(value: unknown, maxLength = 500): string {
  const jsonStr = safeStringifyForError(value)
  const truncated =
    jsonStr.length > maxLength
      ? `${jsonStr.slice(0, maxLength)}...(truncated)`
      : jsonStr
  if (value === null || value === undefined || typeof value !== 'object') {
    return `${truncated} (type: ${value === null ? 'null' : typeof value})`
  }
  return truncated
}
