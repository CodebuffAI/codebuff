import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { TEST_USER_ID } from 'common/constants'
import { getInitialAgentState } from 'common/types/agent-state'
import { WebSocket } from 'ws'
import { mainPrompt } from '../main-prompt'

// Mock imports needed for setup within the test
import { renderReadFilesResult } from '@/util/parse-tool-call-xml'
import * as checkTerminalCommandModule from '../check-terminal-command'
import * as requestFilesPrompt from '../find-files/request-files-prompt'
import * as aisdk from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { logger } from '../util/logger'
import * as websocketAction from '../websockets/websocket-action'

// --- Shared Mocks & Helpers ---

class MockWebSocket {
  send(msg: string) {}
  close() {}
  on(event: string, listener: (...args: any[]) => void) {}
  removeListener(event: string, listener: (...args: any[]) => void) {}
}

const mockFileContext = {
  currentWorkingDirectory: '/test',
  fileTree: [],
  fileTokenScores: {},
  knowledgeFiles: {},
  gitChanges: {
    status: '',
    diff: '',
    diffCached: '',
    lastCommitMessages: '',
  },
  changesSinceLastChat: {},
  shellConfigFiles: {},
  systemInfo: {
    platform: 'test',
    shell: 'test',
    nodeVersion: 'test',
    arch: 'test',
    homedir: '/home/test',
    cpus: 1,
  },
  fileVersions: [],
}

// Mock response chunk handler
const mockOnResponseChunk = mock(() => {})

// --- Integration Test with Real LLM Call ---
describe('mainPrompt (Integration)', () => {
  afterEach(() => {
    mock.restore()
  })

  it.skip('should delete a specified function while preserving other code', async () => {
    // Mock necessary non-LLM functions
    spyOn(logger, 'debug').mockImplementation(() => {})
    spyOn(logger, 'error').mockImplementation(() => {})
    spyOn(logger, 'info').mockImplementation(() => {})
    spyOn(logger, 'warn').mockImplementation(() => {})
    spyOn(requestFilesPrompt, 'requestRelevantFiles').mockResolvedValue([])

    const initialContent = `import { Message } from 'common/types/message'
import { withCacheControl } from 'common/util/messages'

import { System } from '../llm-apis/claude'
import { OpenAIMessage } from '../llm-apis/openai-api'
import { logger } from './logger'
import { simplifyTerminalCommandResults } from './simplify-tool-results'
import { countTokensJson } from './token-counter'

/**
 * Wraps an array of messages with a system prompt for LLM API calls
 * @param messages - Array of messages to wrap
 * @param system - System prompt to prepend
 * @returns Array with system message followed by provided messages
 */
export const messagesWithSystem = (messages: Message[], system: System) =>
  [{ role: 'system', content: system }, ...messages] as OpenAIMessage[]

export function asSystemInstruction(str: string): string {
  return \`<system_instructions>\${str}</system_instructions>\`
}

export function asSystemMessage(str: string): string {
  return \`<system>\${str}</system>\`
}

export function isSystemInstruction(str: string): boolean {
  return (
    str.startsWith('<system_instructions>') &&
    str.endsWith('</system_instructions>')
  )
}

export function isSystemMessage(str: string): boolean {
  return str.startsWith('<system>') && str.endsWith('</system>')
}

/**
 * Extracts the text content from a message, handling both string and array content types
 * @param message - Message to extract text from
 * @returns Combined text content of the message, or undefined if no text content
 */
export function getMessageText(message: Message): string | undefined {
  if (typeof message.content === 'string') {
    return message.content
  }
  return message.content.map((c) => ('text' in c ? c.text : '')).join('\\n')
}

export function castAssistantMessage(message: Message): Message {
  if (message.role !== 'assistant') {
    return message
  }
  if (typeof message.content === 'string') {
    return {
      content: \`<previous_assistant_message>\${message.content}</previous_assistant_message>\`,
      role: 'user' as const,
    }
  }
  return {
    role: 'user' as const,
    content: message.content.map((m) => {
      if (m.type === 'text') {
        return {
          ...m,
          text: \`<previous_assistant_message>\${m.text}</previous_assistant_message>\`,
        }
      }
      return m
    }),
  }
}

// Number of terminal command outputs to keep in full form before simplifying
const numTerminalCommandsToKeep = 5

/**
 * Helper function to simplify terminal command output while preserving some recent ones
 * @param text - Terminal output text to potentially simplify
 * @param numKept - Number of terminal outputs already kept in full form
 * @returns Object containing simplified result and updated count of kept outputs
 */
function simplifyTerminalHelper(
  text: string,
  numKept: number
): { result: string; numKept: number } {
  const simplifiedText = simplifyTerminalCommandResults(text)

  // Keep the full output for the N most recent commands
  if (numKept < numTerminalCommandsToKeep && simplifiedText !== text) {
    return { result: text, numKept: numKept + 1 }
  }

  return {
    result: simplifiedText,
    numKept,
  }
}

// Factor to reduce token count target by, to leave room for new messages
const shortenedMessageTokenFactor = 0.5

/**
 * Trims messages from the beginning to fit within token limits while preserving
 * important content. Also simplifies terminal command outputs to save tokens.
 *
 * The function:
 * 1. Processes messages from newest to oldest
 * 2. Simplifies terminal command outputs after keeping N most recent ones
 * 3. Stops adding messages when approaching token limit
 *
 * @param messages - Array of messages to trim
 * @param systemTokens - Number of tokens used by system prompt
 * @param maxTotalTokens - Maximum total tokens allowed, defaults to 200k
 * @returns Trimmed array of messages that fits within token limit
 */
export function trimMessagesToFitTokenLimit(
  messages: Message[],
  systemTokens: number,
  maxTotalTokens: number = 200_000
): Message[] {
  const MAX_MESSAGE_TOKENS = maxTotalTokens - systemTokens

  // Check if we're already under the limit
  const initialTokens = countTokensJson(messages)

  if (initialTokens < MAX_MESSAGE_TOKENS) {
    return messages
  }

  let totalTokens = 0
  const targetTokens = MAX_MESSAGE_TOKENS * shortenedMessageTokenFactor
  const results: Message[] = []
  let numKept = 0

  // Process messages from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const { role, content } = messages[i]
    let newContent: typeof content

    // Handle string content (usually terminal output)
    if (typeof content === 'string') {
      if (isSystemInstruction(content)) {
        continue
      }
      const result = simplifyTerminalHelper(content, numKept)
      newContent = result.result
      numKept = result.numKept
    } else {
      // Handle array content (mixed content types)
      newContent = []
      // Process content parts from newest to oldest
      for (let j = content.length - 1; j >= 0; j--) {
        const messagePart = content[j]
        // Preserve non-text content (i.e. images)
        if (messagePart.type !== 'text') {
          newContent.push(messagePart)
          continue
        }

        const result = simplifyTerminalHelper(messagePart.text, numKept)
        newContent.push({ ...messagePart, text: result.result })
        numKept = result.numKept
      }
      newContent.reverse()
    }

    // Check if adding this message would exceed our token target
    const message = { role, content: newContent }
    const messageTokens = countTokensJson(message)

    if (totalTokens + messageTokens <= targetTokens) {
      results.push({ role, content: newContent })
      totalTokens += messageTokens
    } else {
      break
    }
  }

  results.reverse()
  return results
}

export function getMessagesSubset(messages: Message[], otherTokens: number) {
  const indexLastSubgoalComplete = messages.findLastIndex(({ content }) => {
    JSON.stringify(content).includes('COMPLETE')
  })

  const messagesSubset = trimMessagesToFitTokenLimit(
    indexLastSubgoalComplete === -1
      ? messages
      : messages.slice(indexLastSubgoalComplete),
    otherTokens
  )

  // Remove cache_control from all messages
  for (const message of messagesSubset) {
    if (typeof message.content === 'object' && message.content.length > 0) {
      delete message.content[message.content.length - 1].cache_control
    }
  }

  // Cache up to the last message!
  const lastMessage = messagesSubset[messagesSubset.length - 1]
  if (lastMessage) {
    messagesSubset[messagesSubset.length - 1] = withCacheControl(lastMessage)
  } else {
    logger.debug(
      {
        messages,
        messagesSubset,
        otherTokens,
      },
      'No last message found in messagesSubset!'
    )
  }

  return messagesSubset
}
`
    spyOn(websocketAction, 'requestFiles').mockResolvedValue({
      'src/util/messages.ts': initialContent,
    })
    spyOn(websocketAction, 'requestOptionalFile').mockResolvedValue(
      initialContent
    )
    spyOn(checkTerminalCommandModule, 'checkTerminalCommand').mockResolvedValue(
      null
    )

    // Mock LLM calls
    spyOn(aisdk, 'promptAiSdk').mockResolvedValue('Mocked non-stream AiSdk')

    const agentState = getInitialAgentState(mockFileContext)
    agentState.messageHistory.push(
      {
        role: 'assistant',
        content:
          '<read_files><paths><path>src/util/messages.ts</path></paths></read_files>',
      },
      {
        role: 'user',
        content: renderReadFilesResult(
          [
            {
              path: 'src/util/messages.ts',
              content: initialContent,
            },
          ],
          {}
        ),
      }
    )

    const {
      toolCalls,
      toolResults,
      agentState: finalAgentState,
    } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      {
        type: 'prompt',
        promptId: 'test-prompt-id',
        fingerprintId: 'test-fingerprint-id',
        prompt: 'test prompt',
        agentState,
        toolResults: [],
        costMode: 'normal',
      },
      'test-user-id',
      'test-client-session-id',
      mockOnResponseChunk,
      undefined, // selectedModel
      null, // orgId
      null // repoUrl
    )
    expect(mockOnResponseChunk).toHaveBeenCalled()
    expect(finalAgentState.messageHistory.length).toBeGreaterThan(
      agentState.messageHistory.length
    )
  }, 60000) // Increase timeout for real LLM call
})
