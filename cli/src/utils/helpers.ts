let timestampFormatter: Intl.DateTimeFormat | null = null
export function initTimestampFormatter() {
  if (timestampFormatter) return
  try {
    timestampFormatter = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    timestampFormatter = null
  }
}

export function formatTimestamp(date = new Date()): string {
  if (timestampFormatter) {
    return timestampFormatter.format(date)
  }
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatQueuedPreview(
  messages: string[],
  maxChars: number = 60,
): string {
  if (messages.length === 0) return ''

  const latestMessage = messages[messages.length - 1]
  const singleLine = latestMessage.replace(/\s+/g, ' ').trim()
  if (!singleLine) return ''

  const countSuffix = messages.length > 1 ? ` (+ ${messages.length - 1})` : ''
  const prefix = '↑ '
  const suffix = ' ↑'
  const availableChars =
    maxChars - prefix.length - suffix.length - countSuffix.length

  let messagePreview = singleLine
  if (singleLine.length > availableChars) {
    messagePreview =
      singleLine.slice(0, Math.max(0, availableChars - 3)) + '...'
  }

  return `${prefix}${messagePreview}${countSuffix}${suffix}`
}
