import db from 'common/db'
import * as schema from 'common/db/schema'
import { gt, and, isNotNull } from 'drizzle-orm'
import { Message } from 'common/actions'

/**
 * Count the number of times the given substring occurs in a string.
 * @param text The text to search.
 * @param substring The substring to count.
 * @returns The number of occurrences.
 */
function countOccurrences(text: string, substring: string): number {
  const regex = new RegExp(
    substring.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    'g'
  )
  const matches = text.match(regex)
  return matches ? matches.length : 0
}

/**
 * Parse a message response which could be a string or Message content array
 */
function parseResponse(response: unknown): string {
  if (typeof response === 'string') {
    return response
  }
  if (Array.isArray(response)) {
    return response
      .map((content) => {
        if (typeof content === 'string') return content
        if ('text' in content) return content.text
        return ''
      })
      .join('\n')
  }
  return JSON.stringify(response)
}

async function main() {
  try {
    // Define the timestamp for one day ago
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // Query the message table for messages with finished_at greater than one day ago
    const messages = await db
      .select({
        id: schema.message.id,
        response: schema.message.response,
        finished_at: schema.message.finished_at,
      })
      .from(schema.message)
      .where(
        and(
          gt(schema.message.finished_at, oneDayAgo),
          isNotNull(schema.message.finished_at),
          isNotNull(schema.message.response)
        )
      )

    let totalEditFileCount = 0
    let messagesWithEdits = 0

    for (const msg of messages) {
      try {
        const responseText = parseResponse(msg.response)
        const count = countOccurrences(responseText, '</edit_fil' + 'e>')
        if (count > 0) {
          messagesWithEdits++
        }
        totalEditFileCount += count
      } catch (error) {
        console.error(`Error processing message ${msg.id}:`, error)
      }
    }

    console.log('Summary:')
    console.log('=========')
    console.log('Total messages processed:', messages.length)
    console.log('Messages containing edits:', messagesWithEdits)
    console.log('Total edit file blocks:', totalEditFileCount)
    console.log(
      'Average edits per message with edits:',
      messagesWithEdits > 0
        ? (totalEditFileCount / messagesWithEdits).toFixed(2)
        : 0
    )
  } catch (error) {
    console.error('Error processing messages:', error)
    process.exit(1)
  } finally {
    // await db.end()
  }
}

// Only run if this is the main module
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}
