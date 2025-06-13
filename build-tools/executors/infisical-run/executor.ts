import { execSync } from 'child_process'
import path from 'path'

import { ExecutorContext } from '@nx/devkit'

export interface InfisicalRunExecutorOptions {
  command: string
  cwd?: string
  logLevel?: string
  env?: string
}

function isInfisicalAvailable(): boolean {
  try {
    execSync('command -v infisical', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export default async function infisicalRunExecutor(
  options: InfisicalRunExecutorOptions,
  context: ExecutorContext
): Promise<{ success: boolean }> {
  const { command, cwd, logLevel = 'warn', env } = options

  const envFlag = env ? `--env=${env}` : ''
  const finalCommand = isInfisicalAvailable()
    ? `infisical run ${envFlag} --log-level=${logLevel} -- ${command}`
        .replace(/\s+/g, ' ')
        .trim()
    : command

  // Resolve cwd relative to the project root to handle cases where
  // the command is run from a subdirectory
  const resolvedCwd = cwd ? path.resolve(context.root, cwd) : context.root

  try {
    execSync(finalCommand, {
      stdio: 'inherit',
      cwd: resolvedCwd,
    })
    return { success: true }
  } catch (error) {
    return { success: false }
  }
}
