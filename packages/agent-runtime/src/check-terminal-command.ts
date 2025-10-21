import { models } from '@codebuff/common/old-constants'
import { withTimeout } from '@codebuff/common/util/promise'

import type { PromptAiSdkFn } from '@codebuff/common/types/contracts/llm'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'

/**
 * Checks if a prompt appears to be a terminal command that can be run directly.
 * Returns the command if it is a terminal command, null otherwise.
 */
export async function checkTerminalCommand(
  params: {
    prompt: string
    promptAiSdk: PromptAiSdkFn
    logger: Logger
  } & ParamsExcluding<PromptAiSdkFn, 'messages' | 'model'>,
): Promise<string | null> {
  const { prompt, promptAiSdk, logger } = params
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
      promptAiSdk({
        ...params,
        messages,
        model: models.openrouter_gpt4_1_nano,
      }).then((response) => response.toLowerCase().includes('y')),
      30000,
      'OpenAI API request timed out',
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
      `Error checking if prompt is terminal command: ${errorMessage}`,
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
