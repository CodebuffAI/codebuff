import { PublisherIdSchema } from '@codebuff/common/types/publisher'

export function validatePublisherName(name: string): string | null {
  if (!name || !name.trim()) {
    return 'Publisher name is required'
  }

  const trimmedName = name.trim()

  if (trimmedName.length < 2) {
    return 'Publisher name must be at least 2 characters long'
  }

  if (trimmedName.length > 50) {
    return 'Publisher name must be no more than 50 characters long'
  }

  return null
}

export function validatePublisherId(id: string): string | null {
  const result = PublisherIdSchema.safeParse(id)
  if (!result.success) {
    return (
      result.error.issues.map((issue) => issue.message).join('\n') ||
      'Invalid publisher ID'
    )
  }

  if (id.length < 3) {
    return 'Publisher ID must be at least 3 characters long'
  }

  if (id.length > 30) {
    return 'Publisher ID must be no more than 30 characters long'
  }

  if (id.startsWith('-') || id.endsWith('-')) {
    return 'Publisher ID cannot start or end with a hyphen'
  }

  return null
}
