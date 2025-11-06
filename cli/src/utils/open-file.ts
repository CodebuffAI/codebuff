import os from 'os'
import { spawn } from 'child_process'

import { logger } from './logger'

const isWindows = os.platform() === 'win32'
const isMac = os.platform() === 'darwin'

const escapeForShell = (value: string): string =>
  `'${value.replace(/'/g, `'\\''`)}'`

const escapeForCmd = (value: string): string =>
  `"${value.replace(/"/g, '""')}"`

const replaceFilePlaceholder = (command: string, filePath: string): string => {
  // Support common placeholders used in editor configs
  let out = command
  if (out.includes('%f')) out = out.replace(/%f/g, filePath)
  if (out.includes('{file}')) out = out.replace(/{file}/g, filePath)
  if (out.includes('${file}')) out = out.replace(/\$\{file\}/g, filePath)
  return out
}

const buildEditorCommands = (filePath: string): string[] => {
  const shellPath = isWindows ? escapeForCmd(filePath) : escapeForShell(filePath)
  const rawPath = filePath

  // Start with env-provided editor commands (highest priority)
  const editorEnvVars = ['CODEBUFF_CLI_EDITOR', 'CODEBUFF_EDITOR', 'VISUAL', 'EDITOR']
  const envCommands = editorEnvVars
    .map((envVar) => process.env[envVar])
    .filter((v): v is string => !!v)
    .map((value) => {
      const withFile = replaceFilePlaceholder(value, rawPath)
      return withFile !== value ? withFile : `${value} ${shellPath}`
    })

  const termProgram = (process.env.TERM_PROGRAM || '').toLowerCase()
  const knownCandidates: Array<{ detect: boolean; command: string }> = [
    {
      detect:
        termProgram.includes('vscode') ||
        'VSCODE_GIT_IPC_HANDLE' in process.env ||
        'VSCODE_PID' in process.env,
      command: `code --goto ${shellPath}`,
    },
    {
      detect:
        termProgram.includes('cursor') ||
        'CURSOR_PORT' in process.env ||
        'CURSOR' in process.env,
      command: `cursor --goto ${shellPath}`,
    },
    {
      detect: termProgram.includes('zed') || process.env.ZED_NODE_ENV !== undefined,
      command: `zed --add ${shellPath}`,
    },
    { detect: termProgram.includes('sublime'), command: `subl ${shellPath}` },
    { detect: termProgram.includes('atom'), command: `atom ${shellPath}` },
  ]

  const detectedCommands = knownCandidates.filter((c) => c.detect).map((c) => c.command)

  // OS fallbacks
  const fallbackCommands = isMac
    ? [`open ${shellPath}`]
    : isWindows
      ? [`start "" ${escapeForCmd(filePath)}`]
      : [`xdg-open ${shellPath}`]

  // Deduplicate while preserving priority: env → detected → fallback
  const seen = new Set<string>()
  const ordered = [...envCommands, ...detectedCommands, ...fallbackCommands]
  const unique = ordered.filter((cmd) => (seen.has(cmd) ? false : (seen.add(cmd), true)))
  return unique
}

const runCommand = async (command: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      stdio: 'ignore',
      detached: true,
    })

    child.on('error', () => {
      resolve(false)
    })

    child.on('close', (code) => {
      resolve(code === 0)
    })

    try {
      child.unref()
    } catch {
      // noop
    }
  })
}

export const openFileAtPath = async (filePath: string): Promise<boolean> => {
  const commands = buildEditorCommands(filePath)

  for (const command of commands) {
    // eslint-disable-next-line no-await-in-loop
    const success = await runCommand(command)
    if (success) {
      return true
    }
  }

  logger.warn(
    { filePath, commands },
    'Failed to open file with any configured editor command',
  )
  return false
}
