import type { ChatMessage } from '../types/chat'
import { isTextBlock } from '../types/chat'

/**
 * Generate a chat title from the first user message
 * Falls back to "New chat" if no user message found
 */
export function generateChatTitle(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((msg) => msg.variant === 'user')

  if (!firstUserMessage) {
    return 'New chat'
  }

  // Extract text from content or blocks
  let text = ''

  // Try direct content first
  if (firstUserMessage.content && firstUserMessage.content.trim()) {
    text = firstUserMessage.content.trim()
  }
  // Try extracting from text blocks
  else if (firstUserMessage.blocks && firstUserMessage.blocks.length > 0) {
    const textBlocks = firstUserMessage.blocks.filter(isTextBlock)
    text = textBlocks.map((block) => block.content).join(' ')
  }

  // Handle slash commands
  if (text.startsWith('/')) {
    const commandEnd = text.indexOf(' ')
    if (commandEnd > 0) {
      const command = text.slice(0, commandEnd)
      const description = text.slice(commandEnd + 1)
      return truncateText(`${command}: ${description}`, 60)
    }
    return truncateText(text, 60)
  }

  // Default truncation
  if (!text) {
    return 'Empty chat'
  }

  return truncateText(text, 60)
}

/**
 * Get the last user prompt from the messages
 * Returns empty string if no user messages found
 */
export function getLastUserPrompt(messages: ChatMessage[]): string {
  // Find last user message
  const userMessages = messages.filter((msg) => msg.variant === 'user')
  const lastUserMessage = userMessages[userMessages.length - 1]

  if (!lastUserMessage) {
    return ''
  }

  // Extract text
  let text = ''
  if (lastUserMessage.content && lastUserMessage.content.trim()) {
    text = lastUserMessage.content.trim()
  } else if (lastUserMessage.blocks && lastUserMessage.blocks.length > 0) {
    const textBlocks = lastUserMessage.blocks.filter(isTextBlock)
    text = textBlocks.map((block) => block.content).join(' ')
  }

  return truncateText(text, 80)
}

/**
 * Format a timestamp as a relative or absolute date
 */
export function formatRelativeDate(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    const now = new Date()

    // Check if invalid date
    if (isNaN(date.getTime())) {
      return 'Unknown date'
    }

    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    // Today
    if (diffDays === 0) {
      return `Today at ${formatTime(date)}`
    }

    // Yesterday
    if (diffDays === 1) {
      return `Yesterday at ${formatTime(date)}`
    }

    // This week (within 7 days)
    if (diffDays < 7) {
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' })
      return `${dayName} at ${formatTime(date)}`
    }

    // Older - show full date
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return 'Unknown date'
  }
}

/**
 * Format time as HH:MM AM/PM
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/**
 * Truncate text to maxLength and add ellipsis if needed
 */
export function truncateText(text: string, maxLength: number): string {
  // Normalize whitespace - collapse multiple spaces/newlines to single space
  const normalized = text.replace(/\s+/g, ' ').trim()

  if (normalized.length <= maxLength) {
    return normalized
  }

  return normalized.slice(0, maxLength).trim() + '...'
}
