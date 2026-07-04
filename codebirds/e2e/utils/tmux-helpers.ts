import { execFileSync } from 'child_process'

import { REPO_ROOT } from './binary-helpers'

const SCRIPTS_DIR = `${REPO_ROOT}/scripts/tmux`

const EXEC_OPTIONS = { encoding: 'utf-8' as const, cwd: REPO_ROOT }

export interface TmuxStartOptions {
  command: string
  name?: string
  width?: number
  height?: number
  waitSeconds?: number
}

export function tmuxStart(options: TmuxStartOptions): string {
  const args: string[] = [
    `${SCRIPTS_DIR}/tmux-start.sh`,
    '--command',
    options.command,
    '--plain',
  ]
  if (options.name) args.push('--name', options.name)
  if (options.width) args.push('--width', String(options.width))
  if (options.height) args.push('--height', String(options.height))
  if (options.waitSeconds !== undefined)
    args.push('--wait', String(options.waitSeconds))

  return execFileSync('bash', args, EXEC_OPTIONS).trim()
}

export function tmuxSend(
  sessionName: string,
  text: string,
  options?: { noEnter?: boolean; waitIdle?: number; force?: boolean },
): void {
  const args: string[] = [
    `${SCRIPTS_DIR}/tmux-send.sh`,
    sessionName,
    text,
  ]
  if (options?.noEnter) args.push('--no-enter')
  if (options?.waitIdle) args.push('--wait-idle', String(options.waitIdle))
  if (options?.force) args.push('--force')

  execFileSync('bash', args, EXEC_OPTIONS)
}

export function tmuxSendKey(sessionName: string, key: string): void {
  execFileSync(
    'bash',
    [`${SCRIPTS_DIR}/tmux-send.sh`, sessionName, '--key', key],
    EXEC_OPTIONS,
  )
}

export function tmuxCapture(
  sessionName: string,
  options?: { waitSeconds?: number; label?: string; noSave?: boolean },
): string {
  const args: string[] = [`${SCRIPTS_DIR}/tmux-capture.sh`, sessionName]
  if (options?.waitSeconds) args.push('--wait', String(options.waitSeconds))
  if (options?.label) args.push('--label', options.label)
  if (options?.noSave) args.push('--no-save')

  return execFileSync('bash', args, {
    ...EXEC_OPTIONS,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

export function tmuxStop(sessionName: string): void {
  try {
    execFileSync(
      'bash',
      [`${SCRIPTS_DIR}/tmux-stop.sh`, sessionName],
      EXEC_OPTIONS,
    )
  } catch {
    // tmux-stop.sh is idempotent; ignore errors if session already gone
  }
}
