import { generateCompactId } from '@codebuff/common/util/string'
import { has } from 'lodash'
import micromatch from 'micromatch'
import { bold, gray } from 'picocolors'

import { getProjectRoot } from '../project-files'
import { loadCodebuffConfig } from './parser'
import { runTerminalCommand } from '../terminal/run-command'
import { logger } from '../utils/logger'
import { Spinner } from '../utils/spinner'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'

/**
 * Runs file change hooks defined in the codebuff.json configuration.
 * Returns an array of tool results for any hooks that fail.
 */
export async function runFileChangeHooks(filesChanged: string[]): Promise<{
  toolResults: CodebuffToolOutput<'run_file_change_hooks'>
  someHooksFailed: boolean
}> {
  const config = loadCodebuffConfig()
  const toolResults: CodebuffToolOutput<'run_file_change_hooks'> = [
    { type: 'json', value: [] },
  ]
  let someHooksFailed = false

  if (!config?.fileChangeHooks) {
    return {
      toolResults,
      someHooksFailed,
    }
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
      if (has(result[0].value, 'exitCode') && result[0].value.exitCode !== 0) {
        someHooksFailed = true
        // Show user this hook failed?
        // logger.warn(
        //   { hookName: hook.name, exitCode: result.exitCode },
        //   'File change hook failed with non-zero exit code'
        // )
      }

      toolResults[0].value.push({
        hookName,
        ...result[0].value,
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
