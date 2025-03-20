import * as path from 'path'
import * as fs from 'fs'
import { Message } from 'common/types/message'
import { getCurrentChatDir, currentChatId } from './project-files'
import { transformJsonInString } from 'common/util/string'
import { type Log } from 'common/browser-actions'
import { match, P } from 'ts-pattern'

export function setMessages(messages: Message[]) {
  // Clean up any screenshots and logs in previous messages
  // Skip the last message as it may not have been processed by the backend yet
  const lastIndex = messages.length - 1
  const cleanedMessages = messages.map((msg, index) => {
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

    return match(msg)
      .with({ content: P.array() }, (message) => ({
        ...message,
        content: message.content.reduce<typeof message.content>(
          (acc, contentObj) => [
            ...acc,
            ...match(contentObj)
              .with({ type: 'tool_result', content: P.string }, (obj) => [
                {
                  ...obj,
                  content: cleanContent(obj.content),
                },
              ])
              .with({ type: 'text', text: P.string }, (obj) => [
                {
                  ...obj,
                  text: cleanContent(obj.text),
                },
              ])
              .otherwise((obj) => [obj]),
          ],
          []
        ),
      }))
      .with({ content: P.string }, (message) => ({
        ...message,
        content: cleanContent(message.content),
      }))
      .otherwise((message) => message)
  })

  // Save messages to chat directory
  try {
    const chatDir = getCurrentChatDir()
    const messagesPath = path.join(chatDir, 'messages.json')

    const messagesData = {
      id: currentChatId,
      messages: cleanedMessages,
      updatedAt: new Date().toISOString(),
    }

    fs.writeFileSync(messagesPath, JSON.stringify(messagesData, null, 2))
  } catch (error) {
    console.error('Failed to save messages to file:', error)
  }
}
