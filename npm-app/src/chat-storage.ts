import { type Log } from 'common/browser-actions'
import { type CodebuffMessage } from 'common/types/message'
import { transformJsonInString } from 'common/util/string'
import * as fs from 'fs'
import * as path from 'path'
import { getCurrentChatDir, getCurrentChatId } from './project-files'
import { logger } from './utils/logger'

export function setMessages(messages: CodebuffMessage[]) {
  // Clean up any screenshots and logs in previous messages
  // Skip the last message as it may not have been processed by the backend yet
  const lastIndex = messages.length - 1
  const cleanedMessages = messages.map((msg, index): CodebuffMessage => {
    if (index === lastIndex) {
      return msg // Preserve the most recent message in its entirety
    }

    // Helper function to clean up message content
    const cleanContent = (content: string) => {
      // Keep only tool logs
      content = transformJsonInString<Array<Log>>(
        content,
        'logs',
        (logs) => logs.filter((log) => log.source === 'tool'),
        '(LOGS_REMOVED)'
      )

      // Remove metrics
      content = transformJsonInString(
        content,
        'metrics',
        () => '(METRICS_REMOVED)',
        '(METRICS_REMOVED)'
      )

      return content
    }

    // Clean up message content
    if (!msg.content) return msg

    if (msg.role === 'tool' || msg.role === 'system') {
      return msg
    }

    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        return { ...msg, content: cleanContent(msg.content) }
      }

      return {
        ...msg,
        content: msg.content.map((part) =>
          part.type === 'text'
            ? { ...part, text: cleanContent(part.text) }
            : part
        ),
      }
    }
    if (typeof msg.content === 'string') {
      return { ...msg, content: cleanContent(msg.content) }
    }

    return {
      ...msg,
      content: msg.content.map((part) =>
        part.type === 'text' ? { ...part, text: cleanContent(part.text) } : part
      ),
    }
  })

  // Save messages to chat directory
  try {
    const chatDir = getCurrentChatDir()
    const messagesPath = path.join(chatDir, 'messages.json')

    const messagesData = {
      id: getCurrentChatId(),
      messages: cleanedMessages,
      updatedAt: new Date().toISOString(),
    }

    fs.writeFileSync(messagesPath, JSON.stringify(messagesData, null, 2))
  } catch (error) {
    console.error('Failed to save messages to file:', error)
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        messagesCount: messages.length,
      },
      'Failed to save messages to file'
    )
  }
}
