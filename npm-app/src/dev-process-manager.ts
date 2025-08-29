import path from 'path'

import { codebuffConfigFile } from '@codebuff/common/json-config/constants'
import { generateCompactId } from '@codebuff/common/util/string'
import { has } from 'lodash'
import { yellow } from 'picocolors'

import { runBackgroundCommand } from './terminal/background'

import type { StartupProcess } from '@codebuff/common/json-config/constants'

/**
 * Starts background development processes defined in the config file.
 * Processes are started asynchronously and their output is tracked.
 * Only enabled processes are started.
 *
 * @param processes - Array of startup process configurations
 * @param projectPath - Base path of the project
 */
export function startDevProcesses(
  processes: StartupProcess[],
  projectPath: string,
) {
  const toStart = processes.filter((process) => process.enabled)

  if (!toStart.length) {
    return
  }

  console.log(yellow(`Starting ${codebuffConfigFile} processes:`))

  for (const {
    name,
    command,
    cwd,
    enabled,
    stderrFile,
    stdoutFile,
  } of processes) {
    if (!enabled) {
      continue
    }

    // Resolve working directory
    const absoluteCwd = cwd
      ? path.isAbsolute(cwd)
        ? cwd
        : path.resolve(projectPath, cwd)
      : projectPath

    // Start the process
    runBackgroundCommand(
      {
        toolCallId: generateCompactId(),
        command,
        mode: 'user',
        cwd: absoluteCwd,
        stdoutFile,
        stderrFile,
      },
      (result) => {
        if (has(result[0].value, 'processId')) {
          console.log(yellow(`- ${name}: ${command}`))
        } else {
          console.log(yellow(`- ${name}: ${command} — failed to start`))
        }
      },
    )
  }

  console.log()
}
