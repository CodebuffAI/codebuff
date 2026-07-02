import { execSync, spawn } from 'child_process'

import {
  createExternalRunnerAbortError,
  isAbortError,
  type Runner,
  type RunnerResult,
  type AgentStep,
  type RunnerOptions,
} from './runner'

export class CodexRunner implements Runner {
  private cwd: string
  private env: Record<string, string>

  constructor(cwd: string, env: Record<string, string> = {}) {
    this.cwd = cwd
    this.env = env
  }

  async run(prompt: string, options: RunnerOptions = {}): Promise<RunnerResult> {
    const steps: AgentStep[] = []
    let totalCostUsd = 0

    return new Promise((resolve, reject) => {
      // Codex CLI uses the prompt as a positional argument
      // Use exec subcommand with --full-auto for automatic execution
      // --full-auto enables -a on-failure and --sandbox workspace-write
      // Use --json for structured output that we can parse
      const args = [
        'exec',
        '--full-auto',
        '--json',
        '-m',
        'gpt-5.1-codex',
        prompt,
      ]

      console.log(`[CodexRunner] Running: codex ${args.join(' ')}`)

      const child = spawn('codex', args, {
        cwd: this.cwd,
        env: {
          ...process.env,
          ...this.env,
          CODEX_API_KEY: process.env.OPENAI_API_KEY || this.env.OPENAI_API_KEY,
        },
        // Use 'ignore' for stdin to prevent the CLI from waiting for input
        stdio: ['ignore', 'pipe', 'pipe'],
        signal: options.signal,
      })

      let _stdout = ''
      let stderr = ''
      let aborted = false
      let settled = false

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString()
        _stdout += chunk
        process.stdout.write(chunk)

        // Codex outputs events as JSON lines in some modes
        const lines = chunk.split('\n').filter((line) => line.trim())
        for (const line of lines) {
          try {
            const event = JSON.parse(line)
            if (event.type === 'message') {
              steps.push({
                type: 'text',
                text: event.content || event.message || '',
              })
            } else if (
              event.type === 'function_call' ||
              event.type === 'tool'
            ) {
              steps.push({
                type: 'tool_call',
                toolName: event.name || event.function?.name || 'unknown',
                toolCallId: event.id || `codex-${Date.now()}`,
                input: event.arguments || event.function?.arguments || {},
              })
            } else if (
              event.type === 'function_result' ||
              event.type === 'tool_result'
            ) {
              steps.push({
                type: 'tool_result',
                toolName: event.name || 'unknown',
                toolCallId: event.id || `codex-${Date.now()}`,
                output: [
                  {
                    type: 'json',
                    value: event.result || event.output || '',
                  },
                ],
              })
            }
          } catch {
            // Plain text output, add as text step
            if (line.trim()) {
              steps.push({
                type: 'text',
                text: line,
              })
            }
          }
        }
      })

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
        process.stderr.write(data)
      })

      const rejectOnce = (error: Error) => {
        if (settled) {
          return
        }
        settled = true
        reject(error)
      }

      const resolveOnce = (result: RunnerResult) => {
        if (settled) {
          return
        }
        settled = true
        resolve(result)
      }

      child.on('error', (error) => {
        if (isAbortError(error)) {
          aborted = true
          rejectOnce(createExternalRunnerAbortError('Codex'))
          return
        }

        rejectOnce(
          new Error(
            `Codex CLI failed to start: ${error.message}. Make sure 'codex' is installed and in PATH.`,
          ),
        )
      })

      child.on('close', (code) => {
        if (aborted || options.signal?.aborted) {
          aborted = true
          rejectOnce(createExternalRunnerAbortError('Codex'))
          return
        }

        // Get git diff after Codex has made changes
        let diff = ''
        try {
          execSync('git add .', { cwd: this.cwd, stdio: 'ignore' })
          diff = execSync('git diff HEAD', {
            cwd: this.cwd,
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
          })
        } catch {
          // Ignore git errors
        }

        if (code !== 0) {
          rejectOnce(
            new Error(`Codex CLI exited with code ${code}. stderr: ${stderr}`),
          )
          return
        }

        resolveOnce({
          steps,
          totalCostUsd, // Codex doesn't report cost in CLI output
          diff,
        })
      })
    })
  }
}
