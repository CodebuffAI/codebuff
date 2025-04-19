import path from 'path'

import { generateCompactId } from 'common/util/string'
import { yellow } from 'picocolors'
import { runBackgroundCommand } from '../utils/terminal'

import { StartupProcess } from './constants'

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
  for (const { name, command, cwd } of processes) {
    // Resolve working directory
    const workingDir = cwd
      ? path.isAbsolute(cwd)
        ? cwd
        : path.resolve(projectPath, cwd)
      : projectPath

    // Start the process
    await runBackgroundCommand(
      generateCompactId(),
      command,
      'user',
      workingDir,
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
