import { generateCompactId } from '@codebuff/common/util/string'
import micromatch from 'micromatch'
import { bold, gray } from 'picocolors'

import { getProjectRoot } from '../project-files'
import { loadCodebuffConfig } from './parser'
import { runTerminalCommand } from '../terminal/run-command'
import { logger } from '../utils/logger'
import { Spinner } from '../utils/spinner'

import type { ToolResult } from '@codebuff/common/types/session-state'

/**
 * Runs file change hooks defined in the codebuff.json configuration.
 * Returns an array of tool results for any hooks that fail.
 */
export async function runFileChangeHooks(
  filesChanged: string[],
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
        continue
      }
    }

    try {
      const hookName = `file-change-hook-${hook.name}`
      const hookId = generateCompactId(`${hookName}-`)

      // Display which hook is running and why
      Spinner.get().stop()
      console.log(gray(`Running ${bold(hook.name)} hook: ${hook.command}`))
      // if (hook.filePattern && filesChanged.length > 0) {
      //   const matchingFiles = micromatch(filesChanged, hook.filePattern)
      //   console.log(gray(`  Triggered by changes to: ${matchingFiles.join(', ')}`))
      // }

      const result = await runTerminalCommand(
        hookId,
        hook.command,
        'assistant',
        'SYNC',
        -1,
        hook.cwd || getProjectRoot(),
        undefined,
        undefined,
      )
      if (result.exitCode !== 0) {
        someHooksFailed = true
        // Show user this hook failed?
        // logger.warn(
        //   { hookName: hook.name, exitCode: result.exitCode },
        //   'File change hook failed with non-zero exit code'
        // )
      }
      toolResults.push({
        toolName: hookName,
        toolCallId: hookId,
        output: { type: 'text', value: result.result },
      })
    } catch (error) {
      logger.error(
        {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          hookName: hook.name,
          hookCommand: hook.command,
        },
        'Error running file change hook',
      )
    }
  }

  return { toolResults, someHooksFailed }
}
