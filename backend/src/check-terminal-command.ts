import { models } from 'common/constants'
import { withTimeout } from 'common/util/promise'

import { promptAiSdk } from './llm-apis/vercel-ai-sdk/ai-sdk'
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
    orgId?: string | null
    repoUrl?: string | null
  }
): Promise<string | null> {
  const { clientSessionId, fingerprintId, userInputId, userId, orgId, repoUrl } = options
  const system = `You are a command line utility. The user will provide a natural language command. If the command is a valid terminal command, output only the command itself. If it is not a valid terminal command, output "NOT_A_COMMAND".

Examples:
User: list all files
Assistant: ls -la
User: what is the meaning of life?
Assistant: NOT_A_COMMAND
User: delete the node_modules folder
Assistant: rm -rf node_modules
User: run the tests
Assistant: npm test
User: can you write a function to do foo?
Assistant: NOT_A_COMMAND`

  const response = await promptAiSdk({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    clientSessionId,
    fingerprintId,
    userInputId,
    model: models.haiku,
    userId,
    temperature: 0,
    maxTokens: 200,
    orgId: orgId ?? null,
    repoUrl: repoUrl ?? null,
  })

  if (response.includes('NOT_A_COMMAND')) {
    return null
  }

  const messages = [
    {
      role: 'user' as const,
      content: `You are checking if the following input (in quotes) is a terminal command that can be run directly without any modification. Only respond with y or n without quotes. Do not explain your reasoning

Examples of terminal commands (y):
- "git pull"
- "npm install"
- "cd .."
- "ls"

Examples of non-terminal commands (n):
- "yes"
- "hi"
- "I need to install the dependencies"
- "run cargo check" (this is a natural language instruction to run a terminal command, not a terminal command itself)
- [... long request ...]

User prompt (in quotes):
${JSON.stringify(prompt)}`,
    },
  ]

  try {
    // Race between OpenAI and Gemini with timeouts
    const response = await withTimeout(
      promptAiSdk({ messages, model: models.gpt4omini, ...options }).then(
        (response) => response.toLowerCase().includes('y')
      ),
      30000,
      'OpenAI API request timed out'
    )

    if (response) {
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

const blacklistedSingleWordCommands = ['halt', 'reboot', 'init']
const blacklistedMultiWordCommands = ['yes']
const isBlacklistedTerminalCommand = (command: string) => {
  if (blacklistedSingleWordCommands.includes(command)) {
    return true
  }

  const firstWord = command.split(' ')[0]

  return blacklistedMultiWordCommands.includes(firstWord)
}
