import { execFileSync, spawnSync } from 'child_process'
import path from 'path'

import type { ExecutorContext } from '@nx/devkit'

export interface InfisicalRunExecutorOptions {
  command: string
  cwd?: string
  logLevel?: string
  env?: string
}

function isInfisicalAvailable(): boolean {
  try {
    execFileSync('infisical', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export default async function infisicalRunExecutor(
  options: InfisicalRunExecutorOptions,
  context: ExecutorContext,
): Promise<{ success: boolean }> {
  const { command, cwd, logLevel = 'warn', env } = options
  if (!isInfisicalAvailable()) return { success: false }
  if (!/^[a-zA-Z0-9._-]+$/.test(logLevel)) return { success: false }
  if (env && !/^[a-zA-Z0-9._-]+$/.test(env)) return { success: false }

  // Resolve cwd relative to the project root to handle cases where
  // the command is run from a subdirectory
  const resolvedCwd = cwd ? path.resolve(context.root, cwd) : context.root
  const relativeCwd = path.relative(path.resolve(context.root), resolvedCwd)
  if (relativeCwd.startsWith('..') || path.isAbsolute(relativeCwd)) {
    return { success: false }
  }

  try {
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
    const shellArgs =
      process.platform === 'win32'
        ? ['/d', '/s', '/c', command]
        : ['-lc', command]
    const result = spawnSync(
      'infisical',
      [
        'run',
        ...(env ? [`--env=${env}`] : []),
        `--log-level=${logLevel}`,
        '--',
        shell,
        ...shellArgs,
      ],
      { stdio: 'inherit', cwd: resolvedCwd },
    )
    return { success: result.status === 0 && !result.error }
  } catch {
    return { success: false }
  }
}
