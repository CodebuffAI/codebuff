import { CoreMessage } from 'ai'
import { withCacheControlCore } from 'common/util/messages'
import fs from 'fs'
import path from 'path'
import { logger } from '../util/logger'

export async function saveAgentRequest(
  messages: CoreMessage[],
  userInputId: string
) {
  try {
    const promptsDir = path.join(process.cwd(), 'system-prompts')
    await fs.promises.mkdir(promptsDir, { recursive: true })

    const messageCount = messages.length
    const filename = `system-prompt-${messageCount}-${userInputId}.json`
    const filePath = path.join(promptsDir, filename)

    const transformedMessages = messages.map(withCacheControlCore)

    await fs.promises.writeFile(
      filePath,
      JSON.stringify(transformedMessages, null, 2)
    )

    logger.debug(
      { messageCount, userInputId },
      `Saved system prompt to ${filePath}`
    )
  } catch (error) {
    logger.error({ error }, 'Failed to save system prompt')
  }
}
