import { ToolResult } from 'common/types/agent-state'
import { generateCompactId } from 'common/util/string'
import micromatch from 'micromatch'

import { getProjectRoot } from '../project-files'
import { runTerminalCommand } from '../terminal/base'
import { logger } from '../utils/logger'
import { loadCodebuffConfig } from './parser'

/**
 * Runs file change hooks defined in the codebuff.json configuration.
 * Returns an array of tool results for any hooks that fail.
 */
export async function runFileChangeHooks(
  filesChanged: string[]
): Promise<{ toolResults: ToolResult[]; someHooksFailed: boolean }> {
  const config = loadCodebuffConfig()
  const toolResults: ToolResult[] = []
  let someHooksFailed = false

  if (!config?.fileChangeHooks) {
    return { toolResults, someHooksFailed }
  }

  for (const hook of config.fileChangeHooks) {
    if (!hook.enabled) {
      continue
    }

    // If a filePattern is specified, check if any of the changed files match
    if (hook.filePattern && filesChanged.length > 0) {
      const matchingFiles = micromatch(filesChanged, hook.filePattern)
      if (matchingFiles.length === 0) {
        // No files match the pattern, skip this hook
        continue
      }
    }

    try {
      const hookName = `file-change-hook-${hook.name}`
      const hookId = generateCompactId(`${hookName}-`)
      const result = await runTerminalCommand(
        hookId,
        hook.command,
        'assistant',
        'SYNC',
        -1,
        hook.cwd || getProjectRoot(),
        undefined,
        undefined
      )
      if (result.exitCode !== 0) {
        someHooksFailed = true
      }
      toolResults.push({
        toolName: hookName,
        toolCallId: hookId,
        result: result.result,
      })
    } catch (error) {
      logger.error(
        {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          hookName: hook.name,
          hookCommand: hook.command,
        },
        'Error running file change hook'
      )
    }
  }

  return { toolResults, someHooksFailed }
}
