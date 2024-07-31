import { WebSocket } from 'ws'
import fs from 'fs'
import path from 'path'

import { promptClaudeStream } from './claude'
import {
  ProjectFileContext,
  parseFileBlocks,
  fileRegex,
} from 'common/util/file'
import { getSystemPrompt } from './system-prompt'
import { STOP_MARKER } from 'common/constants'
import { getTools } from './tools'
import { Message } from 'common/actions'
import { ToolCall } from 'common/actions'
import { debugLog } from './debug'
import { requestFile } from './websockets/websocket-action'
import { generateDiffBlocks } from './generate-diffs-prompt'

/**
 * Prompt claude, handle tool calls, and generate file changes.
 */
export async function mainPrompt(
  ws: WebSocket,
  messages: Message[],
  fileContext: ProjectFileContext,
  onResponseChunk: (chunk: string) => void
) {
  debugLog(
    'Starting promptClaudeAndGetFileChanges',
    'messages:',
    messages.length
  )
  let fullResponse = ''
  let toolCall: ToolCall | null = null
  let continuedMessages: Message[] = []
  let currentFileBlock = ''
  let isComplete = false
  const fileProcessingPromises: Promise<
    { filePath: string; old: string; new: string }[]
  >[] = []

  const system = getSystemPrompt(fileContext)
  const tools = getTools()

  const lastMessage = messages[messages.length - 1]
  if (lastMessage.role === 'user' && typeof lastMessage.content === 'string') {
    lastMessage.content = `${lastMessage.content}

<additional_instruction>
If the user provided a url, please use the scrape_web_page tool on to better answer their question.

Then, please request as many files as would help answer the user's question using the read_files tool.
</additional_instruction>
<additional_instruction>
If the user gave feedback and it helped you understand something better, please edit a knowledge file with a short note that condenses what you learned.
</additional_instruction>
<additional_instruction>
Always end your response with the following marker:
${STOP_MARKER}
</additional_instruction>

This prompt is complete.
${STOP_MARKER}`
  }

  while (!isComplete) {
    const messagesWithContinuedMessage = continuedMessages
      ? [...messages, ...continuedMessages]
      : messages
    console.log(
      'Prompting claude num messages:',
      messagesWithContinuedMessage.length
    )
    debugLog(
      'Prompting claude num messages:',
      messagesWithContinuedMessage.length
    )

    // Save prompt debug information to a JSON file
    const promptDebugInfo = {
      messages: JSON.stringify(messagesWithContinuedMessage).length,
      system: system.length,
      tools: JSON.stringify(tools).length,
    }

    const debugFilePath = path.join(__dirname, 'prompt.debug.json')
    fs.appendFileSync(debugFilePath, JSON.stringify(promptDebugInfo, null, 2))

    const stream = promptClaudeStream(messagesWithContinuedMessage, {
      system,
      tools,
    })

    for await (const chunk of stream) {
      if (typeof chunk === 'object') {
        toolCall = chunk
        debugLog('Received tool call:', toolCall)
        break
      }

      fullResponse += chunk
      currentFileBlock += chunk
      onResponseChunk(chunk)

      const fileBlocks = parseFileBlocks(currentFileBlock)
      for (const [filePath, newFileContent] of Object.entries(fileBlocks)) {
        fileProcessingPromises.push(
          processFileBlock(ws, messages, filePath, newFileContent)
        )

        currentFileBlock = currentFileBlock.replace(fileRegex, '')
      }
    }

    if (fullResponse.includes(STOP_MARKER)) {
      isComplete = true
      fullResponse = fullResponse.replace(STOP_MARKER, '')
      debugLog('Reached STOP_MARKER')
    } else if (toolCall) {
      isComplete = true
    } else {
      console.log('continuing to generate')
      debugLog('continuing to generate')
      const fullResponseMinusLastLine =
        fullResponse.split('\n').slice(0, -1).join('\n') + '\n'
      continuedMessages = [
        {
          role: 'assistant',
          content: fullResponseMinusLastLine,
        },
        {
          role: 'user',
          content: `You got cut off, but please continue from the very next line of your response. Do not repeat anything you have just said. Just continue as if there were no interruption from the very last character of your last response. (Alternatively, just end your response with the following marker if you were done generating and want to allow the user to give further guidance: ${STOP_MARKER})`,
        },
      ]
    }
  }

  const changes = (await Promise.all(fileProcessingPromises)).flat()

  return {
    response: fullResponse,
    changes,
    toolCall,
  }
}

export async function processFileBlock(
  ws: WebSocket,
  messageHistory: Message[],
  filePath: string,
  newContent: string
) {
  debugLog('Processing file block', filePath)

  const oldContent = await requestFile(ws, filePath)

  if (oldContent === null) {
    debugLog(`Created new file: ${filePath}`)
    return [{ filePath, old: '', new: newContent }]
  }

  const lineEnding = oldContent.includes('\r\n') ? '\r\n' : '\n'

  const normalizeLineEndings = (str: string) => str.replace(/\r\n/g, '\n')
  const normalizedOldContent = normalizeLineEndings(oldContent)
  const normalizedNewContent = normalizeLineEndings(newContent)

  const diffBlocks = await generateDiffBlocks(
    messageHistory,
    filePath,
    normalizedOldContent,
    normalizedNewContent
  )
  let updatedContent = normalizedOldContent

  const changes: { filePath: string; old: string; new: string }[] = []
  for (const { searchContent, replaceContent } of diffBlocks) {
    if (updatedContent.includes(searchContent)) {
      debugLog('Replacement worked with exact match')
      updatedContent = updatedContent.replace(searchContent, replaceContent)
      changes.push({ filePath, old: searchContent, new: replaceContent })
      console.log('Applied a change to', filePath)
      debugLog(`Applied a change to ${filePath}:`, {
        old: searchContent,
        new: replaceContent,
      })
    } else {
      debugLog('Failed to find a match for replacement in', filePath)
      debugLog('Old content:', oldContent)
      debugLog('New content:', newContent)
    }
  }

  if (changes.length === 0) {
    debugLog(`No changes applied to file: ${filePath}`)
    return []
  }

  debugLog(`Updated file: ${filePath}`)
  const changesWithOriginalLineEndings = changes.map((change) => ({
    ...change,
    old: change.old.replace(/\n/g, lineEnding),
    new: change.new.replace(/\n/g, lineEnding),
  }))
  return changesWithOriginalLineEndings
}
