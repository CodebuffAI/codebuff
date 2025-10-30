export type FormattedValidationError = {
  fieldName?: string
  message: string
}

export const formatValidationError = (rawMessage: string): FormattedValidationError => {
  // Strip agent name prefix and "Schema validation failed" text
  let message = rawMessage
    .replace(/Agent "[^"]+"\s*(?:\([^)]+\))?\s*:\s*/, '')
    .replace(/Schema validation failed:\s*/i, '')
    .trim()

  // Try parsing JSON error array
  if (message.startsWith('[')) {
    try {
      const errors = JSON.parse(message)
      if (Array.isArray(errors) && errors.length > 0) {
        const first = errors[0]
        const field = first.path?.join('.') || undefined
        return { fieldName: field, message: first.message || message }
      }
    } catch {
      // Continue with string processing
    }
  }

  // Extract field:message pattern
  const match = message.match(/^([^:]+):\s*(.+)$/)
  if (match && /^[\w.\-\[\]]+$/.test(match[1])) {
    return { fieldName: match[1], message: match[2] }
  }

  return { fieldName: undefined, message }
}
