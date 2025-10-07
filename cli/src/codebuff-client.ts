import { CodebuffClient } from '@codebuff/sdk'
import { logger } from './logger'

let clientInstance: CodebuffClient | null = null

export function getCodebuffClient(): CodebuffClient | null {
  logger.info('getCodebuffClient() called')

  if (!clientInstance) {
    const apiKey = process.env.CODEBUFF_API_KEY
    if (!apiKey) {
      logger.warn('No CODEBUFF_API_KEY found in environment variables')
      return null
    }

    logger.info('Initializing CodebuffClient with API key')
    try {
      clientInstance = new CodebuffClient({
        apiKey,
        cwd: process.cwd(),
      })
      logger.info('CodebuffClient initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize CodebuffClient', error)
      return null
    }
  }

  return clientInstance
}

export function getToolDisplayInfo(toolName: string): {
  name: string
  type: string
} {
  const toolNameMap: Record<string, string> = {
    write_file: 'File Writer',
    str_replace: 'File Editor',
    read_files: 'File Reader',
    code_search: 'Code Search',
    run_terminal_command: 'Terminal',
    browser_logs: 'Browser',
    run_file_change_hooks: 'File Hooks',
    web_search: 'Web Search',
    read_docs: 'Doc Reader',
    spawn_agents: 'Agent Spawner',
  }

  return {
    name:
      toolNameMap[toolName] ||
      toolName.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
    type: 'tool',
  }
}

export function formatToolOutput(output: unknown): string {
  if (!output) return ''

  if (Array.isArray(output)) {
    return output
      .map((item) => {
        if (item.type === 'json') {
          return JSON.stringify(item.value, null, 2)
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

  return JSON.stringify(output, null, 2)
}
