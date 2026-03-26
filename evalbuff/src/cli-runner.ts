import { execSync, spawn } from 'child_process'

export interface CliRunnerOptions {
  command: string // e.g., "claude -p" or "codex exec --full-auto"
  prompt: string
  cwd: string
  timeoutMs: number // Default 300_000 (5 min)
  env?: Record<string, string>
}

export interface CliRunnerResult {
  diff: string
  durationMs: number
  exitCode: number
  stdout: string
  stderr: string
}

export async function runCliAgent(
  options: CliRunnerOptions,
): Promise<CliRunnerResult> {
  const { command, prompt, cwd, timeoutMs, env } = options
  const startTime = Date.now()

  return new Promise((resolve, reject) => {
    const [cmd, ...baseArgs] = command.split(' ')
    const args = [...baseArgs, prompt]

    console.log(`[CliRunner] Running: ${cmd} ${baseArgs.join(' ')} <prompt>`)

    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      // Give it 5 seconds to clean up, then force kill
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL')
        }
      }, 5000)
    }, timeoutMs)

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
      process.stderr.write(data)
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(
        new Error(
          `CLI agent failed to start: ${error.message}. Make sure '${cmd}' is installed and in PATH.`,
        ),
      )
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      const durationMs = Date.now() - startTime

      // Capture git diff of agent's changes
      let diff = ''
      try {
        execSync('git add .', { cwd, stdio: 'ignore' })
        diff = execSync('git diff HEAD', {
          cwd,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        })
      } catch {
        // Ignore git errors
      }

      resolve({
        diff,
        durationMs,
        exitCode: code ?? 1,
        stdout,
        stderr,
      })
    })
  })
}
