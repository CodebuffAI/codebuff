import path from 'path'

import { generateCompactId } from 'common/util/string'
import { yellow } from 'picocolors'
import { runBackgroundCommand } from 'src/utils/terminal'

import { StartupProcess } from './constants'

/**
 * Starts background development processes defined in codebuff.json
 */
export async function startDevProcesses(
  processes: StartupProcess[],
  projectPath: string
) {
  if (processes.length) {
    console.log(yellow('Starting dev processes:'))
  }
  for (const { name, command, cwd } of processes) {
    // Resolve working directory
    const workingDir = cwd
      ? path.isAbsolute(cwd)
        ? cwd
        : path.resolve(projectPath, cwd)
      : projectPath

    // Start the process
    console.log(yellow(`- ${name}: \`${command}\``))

    await runBackgroundCommand(
      generateCompactId(),
      command,
      'user',
      workingDir,
      () => {}
    )
  }
}
