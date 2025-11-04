import { CodebuffClient } from '@codebuff/sdk'

import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { findGitRoot } from './git'
import { getAuthTokenDetails } from './auth'
import { loadAgentDefinitions } from './load-agent-definitions'
import { logger } from './logger'

let clientInstance: CodebuffClient | null = null

export function getCodebuffClient(): CodebuffClient | null {
  if (!clientInstance) {
    const { token: apiKey, source } = getAuthTokenDetails()

    if (!apiKey) {
      logger.warn(
        {},
        `No authentication token found. Please run the login flow or set ${API_KEY_ENV_VAR}.`,
      )
      return null
    }

    const gitRoot = findGitRoot()
    try {
      const agentDefinitions = loadAgentDefinitions()
      clientInstance = new CodebuffClient({
        apiKey,
        cwd: gitRoot,
        agentDefinitions,
      })
    } catch (error) {
      logger.error(error, 'Failed to initialize CodebuffClient')
      return null
    }
  }

  return clientInstance
}

export function getToolDisplayInfo(toolName: string): {
  name: string
  type: string
} {
  const TOOL_NAME_OVERRIDES: Record<string, string> = {
    list_directory: 'List Directories',
  }

  const capitalizeWords = (str: string) => {
    return str.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  }

  return {
    name: TOOL_NAME_OVERRIDES[toolName] ?? capitalizeWords(toolName),
    type: 'tool',
  }
}

function toYaml(obj: any, indent = 0): string {
  const spaces = '  '.repeat(indent)

  if (obj === null || obj === undefined) {
    return 'null'
  }

  if (typeof obj === 'string') {
    if (obj.includes('\n')) {
      const lines = obj.split('\n')
      return (
        '|\n' + lines.map((line) => '  '.repeat(indent + 1) + line).join('\n')
      )
    }
    return obj.includes(':') || obj.includes('#') ? `"${obj}"` : obj
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj)
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]'
    return (
      '\n' +
      obj
        .map((item) => spaces + '- ' + toYaml(item, indent + 1).trimStart())
        .join('\n')
    )
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj)
    if (entries.length === 0) return '{}'

    return entries
      .map(([key, value]) => {
        const yamlValue = toYaml(value, indent + 1)
        if (
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value) &&
          Object.keys(value).length > 0
        ) {
          return `${spaces}${key}:\n${yamlValue}`
        }
        if (typeof value === 'string' && value.includes('\n')) {
          return `${spaces}${key}: ${yamlValue}`
        }
        return `${spaces}${key}: ${yamlValue}`
      })
      .join('\n')
  }

  return String(obj)
}

export function formatToolOutput(output: unknown): string {
  if (!output) return ''

  if (Array.isArray(output)) {
    return output
      .map((item) => {
        if (item.type === 'json') {
          return toYaml(item.value)
        }
        if (item.type === 'text') {
          return item.text || ''
        }
        return String(item)
      })
      .join('\n')
  }

  if (typeof output === 'string') {
    return output
  }

  return toYaml(output)
}
