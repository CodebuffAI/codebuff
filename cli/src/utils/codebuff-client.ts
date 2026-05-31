import { AskUserBridge } from '@codebuff/common/utils/ask-user-bridge'
import { CodebuffClient, LOCAL_MODE_API_KEY } from '@codebuff/sdk'

import { getRgPath } from '../native/ripgrep'
import { getProjectRoot } from '../project-files'
import { getCliEnv, getSystemProcessEnv } from './env'
import { logger } from './logger'

import type { ClientToolCall } from '@codebuff/common/tools/list'

// Singleton instance of the SDK's CodebuffClient for reuse within the CLI
let clientInstance: CodebuffClient | null = null

let lastApiKey: string | null = null

/**
 * Recursively removes undefined values from an object to ensure clean JSON serialization.
 * This prevents issues with APIs that don't accept explicit undefined values.
 */
function removeUndefinedValues<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedValues) as T
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = removeUndefinedValues(value)
      }
    }
    return result as T
  }
  return obj
}

/**
 * Reset the API client singleton so it picks up new settings
 * on the next call to getCodebuffClient().
 */
export function resetCodebuffClient(): void {
  clientInstance = null
  lastApiKey = null
}

export async function getCodebuffClient(): Promise<CodebuffClient> {
  const apiKey = LOCAL_MODE_API_KEY

  // Reuse singleton when key hasn't changed
  if (clientInstance) {
    if (apiKey === lastApiKey) return clientInstance
  }

  // Set up ripgrep path for SDK to use
  const env = getCliEnv()
  if (env.CODEBUFF_IS_BINARY) {
    try {
      const rgPath = await getRgPath()
      // Note: We still set process.env here because SDK reads from it
      getSystemProcessEnv().CODEBUFF_RG_PATH = rgPath
    } catch (error) {
      logger.error(error, 'Failed to set up ripgrep binary for SDK')
    }
  }

  clientInstance = new CodebuffClient({
    apiKey,
    localMode: true,
    cwd: getProjectRoot(),
    logger,
    overrideTools: {
      ask_user: async (input: ClientToolCall<'ask_user'>['input']) => {
        const askUserResponse = await AskUserBridge.request(
          'cli-override',
          input.questions,
        )
        const response = askUserResponse as {
          answers?: Array<{ questionIndex: number; selectedOption: string }>
          skipped?: boolean
        }
        return [
          {
            type: 'json',
            value: removeUndefinedValues(response),
          },
        ]
      },
    },
  })
  lastApiKey = apiKey

  return clientInstance
}