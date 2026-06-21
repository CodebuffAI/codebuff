/**
 * Thin process runner for `git` and `gh` (§6.3). The worktree manager shells out
 * to the user's local CLIs in V1; a Freebuff GitHub App replaces `gh` pre-launch
 * (MH). Kept injectable so the worktree manager can be tested against a real temp
 * repo without a network remote.
 */

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
  /** True if the process was killed by `timeoutMs` before exiting. */
  timedOut?: boolean
}

export interface ExecOpts {
  cwd?: string
  /** Kill the process after this many ms (e.g. the Run panel's bounded commands). */
  timeoutMs?: number
  /** Truncate each of stdout/stderr to this many bytes. */
  outputCapBytes?: number
}

export interface CommandRunner {
  run(command: string, args: string[], opts?: ExecOpts): Promise<ExecResult>
}

/** Default runner backed by `Bun.spawn`. */
export const bunRunner: CommandRunner = {
  async run(command, args, opts) {
    const proc = Bun.spawn([command, ...args], {
      cwd: opts?.cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    let timedOut = false
    const timer = opts?.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          proc.kill()
        }, opts.timeoutMs)
      : undefined
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    if (timer) clearTimeout(timer)
    const cap = (s: string) =>
      opts?.outputCapBytes && s.length > opts.outputCapBytes
        ? s.slice(0, opts.outputCapBytes) + '\n…(truncated)'
        : s
    return { stdout: cap(stdout), stderr: cap(stderr), exitCode, timedOut }
  },
}

export class CommandError extends Error {
  constructor(
    message: string,
    readonly result: ExecResult,
  ) {
    super(message)
    this.name = 'CommandError'
  }
}

/** Run and throw on non-zero exit, surfacing stderr. */
export async function runOrThrow(
  runner: CommandRunner,
  command: string,
  args: string[],
  opts?: { cwd?: string },
): Promise<string> {
  const result = await runner.run(command, args, opts)
  if (result.exitCode !== 0) {
    throw new CommandError(
      `${command} ${args.join(' ')} failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
      result,
    )
  }
  return result.stdout
}
