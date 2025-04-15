import { models } from 'common/constants'
import { withTimeout } from 'common/util/promise'

import { promptGeminiWithFallbacks } from './llm-apis/gemini-with-fallbacks'
import { promptOpenAI } from './llm-apis/openai-api'
import { logger } from './util/logger'

/**
 * Checks if a prompt appears to be a terminal command that can be run directly.
 * Returns the command if it is a terminal command, null otherwise.
 */
export async function checkTerminalCommand(
  prompt: string,
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
  }
): Promise<string | null> {
  if (!prompt?.trim()) {
    return null
  }
  if (prompt.startsWith('!')) {
    return prompt.slice(1)
  }
  if (prompt.startsWith('/run ')) {
    return prompt.slice('/run '.length)
  }
  if (isWhitelistedTerminalCommand(prompt)) {
    return prompt
  }
  if (isBlacklistedTerminalCommand(prompt)) {
    return null
  }

  const messages = [
    {
      role: 'user' as const,
      content: `You are checking if the following input (in quotes) is a terminal command that can be run directly without any modification. Only respond with "yes" or "no". Do not explain your reasoning.

Examples of terminal commands ('yes'):
- "git pull"
- "npm install"
- "cd .."
- "ls"

Examples of non-terminal commands ('no'):
- "yes"
- "hi"
- "I need to install the dependencies"
- [... long request ...]

Input: ${JSON.stringify(prompt)}`,
    },
  ]

  try {
    // Race between OpenAI and Gemini with timeouts
    const response = await Promise.race([
      withTimeout(
        promptOpenAI(messages, {
          model: models.gpt4omini,
          ...options,
        }),
        30000,
        'OpenAI API request timed out'
      ),
      withTimeout(
        promptGeminiWithFallbacks(messages, undefined, {
          model: models.gemini2flash,
          ...options,
        }),
        30000,
        'Gemini API request timed out'
      ),
    ])

    const isTerminalCommand = response.toLowerCase().includes('yes')
    if (isTerminalCommand) {
      return prompt
    }
    return null
  } catch (error) {
    // If both LLM calls fail, return false to fall back to normal processing
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(
      { error },
      `Error checking if prompt is terminal command: ${errorMessage}`
    )
    return null
  }
}

const singleWordCommands = ['clear', 'ls', 'pwd', 'dir']
const multiWordCommands = [
  'git',
  'npm',
  'yarn',
  'pnpm',
  'bun',
  'cd',
  'cat',
  'echo',
  'kill',
  'rm',
  'touch',
  'grep',
  'cp',
  'mv',
  'mkdir',
  'sudo',
  'ln',
  'chmod',
  'chown',
  'chgrp',
  'chmod',
  'chown',
  'chgrp',
]
const isWhitelistedTerminalCommand = (command: string) => {
  if (singleWordCommands.includes(command)) {
    return true
  }

  const numWords = command.split(' ').length
  const firstWord = command.split(' ')[0]

  if (numWords <= 4 && multiWordCommands.includes(firstWord)) {
    return true
  }

  return false
}

const blacklistedSingleWordCommands = ['halt', 'reboot']
const blacklistedMultiWordCommands = ['yes']
const isBlacklistedTerminalCommand = (command: string) => {
  if (blacklistedSingleWordCommands.includes(command)) {
    return true
  }

  const firstWord = command.split(' ')[0]

  return blacklistedMultiWordCommands.includes(firstWord)
}
