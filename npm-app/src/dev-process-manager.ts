import path from 'path'

import { StartupProcess } from 'common/json-config/constants'
import { generateCompactId } from 'common/util/string'
import { yellow } from 'picocolors'

import { runBackgroundCommand } from './utils/terminal'

/**
 * Starts background development processes defined in codebuff.json
 */
export async function startDevProcesses(
  processes: StartupProcess[],
  projectPath: string
) {
  if (processes.length) {
    console.log(yellow('Starting development processes:'))
  }
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
    const workingDir = cwd
      ? path.isAbsolute(cwd)
        ? cwd
        : path.resolve(projectPath, cwd)
      : projectPath

    // Start the process
    await runBackgroundCommand(
      {
        toolCallId: generateCompactId(),
        command,
        mode: 'user',
        projectPath: workingDir,
        stdoutFile,
        stderrFile,
      },
      ({ result }) => {
        const m = result.match(/<process_id>(\d+)<\/process_id>/)
        if (m) {
          console.log(yellow(`- ${name}: \`${command}\` (pid: ${m[1]})`))
        } else {
          console.log(yellow(`- ${name}: \`${command}\` failed to start`))
        }
      }
    )
  }
}
