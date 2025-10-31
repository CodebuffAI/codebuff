export type FormattedValidationError = {
  fieldName?: string
  message: string
}

type ValidationErrorObject = {
  path?: string[]
  message?: string
  code?: string
}

const stripCommonPrefixes = (text: string): string => {
  return text
    .replace(/Agent "[^"]+"\s*(?:\([^)]+\))?\s*:\s*/g, '')
    .replace(/Schema validation failed:\s*/gi, '')
    .trim()
}

const tryParseJsonErrors = (text: string): FormattedValidationError | null => {
  if (!text.startsWith('[') && !text.startsWith('{')) {
    return null
  }

  try {
    const parsed = JSON.parse(text)
    const errors = Array.isArray(parsed) ? parsed : [parsed]

    if (errors.length === 0) {
      return null
    }

    const first = errors[0] as ValidationErrorObject
    const fieldName = Array.isArray(first.path) && first.path.length > 0
      ? first.path.join('.')
      : undefined

    const message = typeof first.message === 'string' && first.message.length > 0
      ? first.message
      : text

    return { fieldName, message }
  } catch {
    return null
  }
}

const tryExtractFieldPattern = (text: string): FormattedValidationError | null => {
  const colonIndex = text.indexOf(':')
  if (colonIndex === -1) {
    return null
  }

  const potentialField = text.slice(0, colonIndex).trim()
  const remainingMessage = text.slice(colonIndex + 1).trim()

  // Validate that the field looks like a valid identifier or path
  // Allow word characters, dots, hyphens, brackets, and underscores
  if (!/^[\w.\-\[\]]+$/.test(potentialField) || remainingMessage.length === 0) {
    return null
  }

  return { fieldName: potentialField, message: remainingMessage }
}

export const formatValidationError = (rawMessage: string): FormattedValidationError => {
  if (typeof rawMessage !== 'string' || rawMessage.length === 0) {
    return { fieldName: undefined, message: 'Unknown validation error' }
  }

  const cleaned = stripCommonPrefixes(rawMessage)

  // Try parsing as JSON first
  const jsonResult = tryParseJsonErrors(cleaned)
  if (jsonResult) {
    return jsonResult
  }

  // Try extracting field:message pattern
  const fieldResult = tryExtractFieldPattern(cleaned)
  if (fieldResult) {
    return fieldResult
  }

  // Fall back to the cleaned message without a field
  return { fieldName: undefined, message: cleaned }
}
