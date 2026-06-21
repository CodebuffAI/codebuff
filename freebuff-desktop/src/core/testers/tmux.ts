/**
 * Tmux CLI/server tester (M1, §7.1) — the non-web surface. Runs a sequence of
 * commands in a real tmux session and captures the pane, so a CLI, REPL, or
 * long-lived server can be exercised the way a person would (not just a one-shot
 * `run`). The captured terminal output becomes the evidence the test agent asserts
 * on and that rides along on the PR.
 */

import { bunRunner } from '../exec'

export interface TmuxResult {
  output: string
  commands: string[]
  error?: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function runInTmux(
  cwd: string,
  commands: string[],
  opts: { settleMs?: number } = {},
): Promise<TmuxResult> {
  const session = `fbtest_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
  const tmux = (args: string[]) => bunRunner.run('tmux', args, {})

  const probe = await tmux(['-V'])
  if (probe.exitCode !== 0) {
    return { output: '', commands, error: 'tmux not available' }
  }

  try {
    // A plain bash (no rc/profile) gives a simple, predictable prompt so captured
    // output is clean — a themed login shell redraws and eats early keystrokes.
    await tmux([
      'new-session', '-d', '-s', session, '-x', '200', '-y', '50', '-c', cwd,
      'bash --norc --noprofile',
    ])
    await sleep(600) // let the shell start before typing
    for (const cmd of commands) {
      await tmux(['send-keys', '-t', session, cmd, 'Enter'])
      await sleep(opts.settleMs ?? 800)
    }
    await sleep(300)
    const cap = await tmux(['capture-pane', '-p', '-t', session])
    return { output: cap.stdout.replace(/\n+$/, ''), commands }
  } catch (e) {
    return { output: '', commands, error: (e as Error).message }
  } finally {
    await tmux(['kill-session', '-t', session]).catch(() => {})
  }
}
