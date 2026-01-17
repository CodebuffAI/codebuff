import { execSync } from 'child_process'

export type KnownShell =
  | 'bash'
  | 'zsh'
  | 'fish'
  | 'cmd.exe'
  | 'powershell'
  | 'unknown'

export type ShellName = KnownShell | string

/**
 * Environment variables used for shell detection.
 * This is a subset that works across CLI and SDK contexts.
 * The index signature allows compatibility with NodeJS.ProcessEnv.
 */
export interface ShellDetectionEnv {
  SHELL?: string
  COMSPEC?: string
  [key: string]: string | undefined
}

const SHELL_ALIASES: Record<string, KnownShell> = {
  bash: 'bash',
  zsh: 'zsh',
  fish: 'fish',
  cmd: 'cmd.exe',
  'cmd.exe': 'cmd.exe',
  pwsh: 'powershell',
  powershell: 'powershell',
  'powershell.exe': 'powershell',
}

/**
 * Shell arguments for command execution.
 * Maps shell names to their command-line argument for executing a command string.
 */
export const SHELL_COMMAND_ARGS: Record<string, string[]> = {
  'cmd.exe': ['/c'],
  powershell: ['-Command'],
  bash: ['-c'],
  zsh: ['-c'],
  fish: ['-c'],
  unknown: ['-c'], // Default to Unix-style
}

/**
 * Get the command-line arguments needed to execute a command in the given shell.
 */
export function getShellArgs(shell: ShellName): string[] {
  return SHELL_COMMAND_ARGS[shell] ?? SHELL_COMMAND_ARGS['unknown']
}

let cachedShell: ShellName | null = null

/**
 * Detects the user's shell from environment variables and parent process inspection.
 * Results are cached for the lifetime of the process.
 * 
 * @param env - Environment variables to use for detection (defaults to process.env)
 * @param useCache - Whether to use cached result (defaults to true)
 */
export function detectShell(
  env: ShellDetectionEnv = process.env,
  useCache: boolean = true,
): ShellName {
  if (useCache && cachedShell) {
    return cachedShell
  }

  const detected =
    detectFromEnvironment(env) ?? detectViaParentProcessInspection() ?? 'unknown'
  
  if (useCache) {
    cachedShell = detected
  }
  
  return detected
}

/**
 * Clears the cached shell detection result.
 * Useful for testing or when the shell might have changed.
 */
export function clearShellCache(): void {
  cachedShell = null
}

function detectFromEnvironment(env: ShellDetectionEnv): ShellName | null {
  const candidates: Array<string | undefined> = []

  if (process.platform === 'win32') {
    candidates.push(env.COMSPEC, env.SHELL)
  } else {
    candidates.push(env.SHELL)
  }

  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate)
    if (normalized) {
      return normalized
    }
  }

  return null
}

function detectViaParentProcessInspection(): ShellName | null {
  try {
    if (process.platform === 'win32') {
      const parentProcess = execSync(
        'wmic process get ParentProcessId,CommandLine',
        { stdio: 'pipe' },
      )
        .toString()
        .toLowerCase()

      if (parentProcess.includes('powershell')) return 'powershell'
      if (parentProcess.includes('cmd.exe')) return 'cmd.exe'
    } else {
      const parentProcess = execSync(`ps -p ${process.ppid} -o comm=`, {
        stdio: 'pipe',
      })
        .toString()
        .trim()
      const normalized = normalizeCandidate(parentProcess)
      if (normalized) return normalized
    }
  } catch {
    // Ignore inspection errors
  }

  return null
}

function normalizeCandidate(value?: string | null): ShellName | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const lower = trimmed.toLowerCase()
  const parts = lower.split(/[/\\]/)
  const last = parts.pop() ?? lower
  const base = last.endsWith('.exe') ? last.slice(0, -4) : last

  if (SHELL_ALIASES[base]) {
    return SHELL_ALIASES[base]
  }

  if (SHELL_ALIASES[last]) {
    return SHELL_ALIASES[last]
  }

  if (base.endsWith('sh')) {
    return base
  }

  return null
}
