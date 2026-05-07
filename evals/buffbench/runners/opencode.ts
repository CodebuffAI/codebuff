import { execSync, spawn } from 'child_process'

import type { AgentStep, Runner, RunnerResult } from './runner'
import type {
  PrintModeToolCall,
  PrintModeToolResult,
} from '@codebuff/common/types/print-mode'
import type { JSONValue } from '@codebuff/common/types/json'

const OPENCODE_MODEL = 'opencode/kimi-k2.6'

function toJsonValue(value: unknown): JSONValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(toJsonValue)
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)]),
    )
  }

  return String(value)
}

type OpenCodeEvent = {
  type?: string
  sessionID?: string
  error?: {
    name?: string
    message?: string
    statusCode?: number
    data?: {
      message?: string
    }
  }
  part?: {
    id?: string
    type?: string
    text?: string
    tool?: string
    callID?: string
    state?: {
      input?: unknown
      output?: unknown
    }
    cost?: number
  }
}

function formatOpenCodeError(error: OpenCodeEvent['error']): string {
  const message =
    error?.data?.message ||
    error?.message ||
    error?.name ||
    'OpenCode emitted an error event.'

  return error?.statusCode ? `${message} (status ${error.statusCode})` : message
}

export class OpenCodeRunner implements Runner {
  private cwd: string
  private env: Record<string, string>

  constructor(cwd: string, env: Record<string, string> = {}) {
    this.cwd = cwd
    this.env = env
  }

  async run(prompt: string): Promise<RunnerResult> {
    const steps: AgentStep[] = []
    let totalCostUsd = 0

    return new Promise((resolve, reject) => {
      let openCodeError: string | undefined
      const model =
        this.env.OPENCODE_MODEL || process.env.OPENCODE_MODEL || OPENCODE_MODEL
      const args = [
        'run',
        '--model',
        model,
        '--format',
        'json',
        '--agent',
        'build',
        prompt,
      ]

      console.log(`[OpenCodeRunner] Running: opencode run --model ${model}`)

      const child = spawn('opencode', args, {
        cwd: this.cwd,
        env: {
          ...process.env,
          ...this.env,
          OPENCODE_API_KEY:
            this.env.OPENCODE_API_KEY || process.env.OPENCODE_API_KEY,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdoutBuffer = ''
      let stderr = ''

      const processEvent = (event: OpenCodeEvent) => {
        if (event.type === 'error') {
          openCodeError = formatOpenCodeError(event.error)
          steps.push({
            type: 'text',
            text: `[OpenCode error] ${openCodeError}`,
          })
          return
        }

        const part = event.part
        if (!part) {
          return
        }

        if (event.type === 'text' || part.type === 'text') {
          const text = part.text ?? ''
          if (text.length > 0) {
            steps.push({ type: 'text', text })
            process.stdout.write(text)
          }
          return
        }

        if (event.type === 'step_finish' || part.type === 'step-finish') {
          if (typeof part.cost === 'number') {
            totalCostUsd += part.cost
          }
          return
        }

        if (part.type === 'tool') {
          const toolName = part.tool ?? 'unknown'
          const toolCallId = part.callID ?? part.id ?? `opencode-${Date.now()}`
          const input = part.state?.input ?? {}

          const toolCall: PrintModeToolCall = {
            type: 'tool_call',
            toolName,
            toolCallId,
            input:
              input && typeof input === 'object'
                ? (input as Record<string, unknown>)
                : { input },
          }
          steps.push(toolCall)

          if (part.state && 'output' in part.state) {
            const toolResult: PrintModeToolResult = {
              type: 'tool_result',
              toolName,
              toolCallId,
              output: [
                {
                  type: 'json',
                  value: toJsonValue(part.state.output ?? ''),
                },
              ],
            }
            steps.push(toolResult)
          }
        }
      }

      const processLine = (line: string) => {
        if (!line.trim()) {
          return
        }

        try {
          processEvent(JSON.parse(line))
        } catch {
          steps.push({ type: 'text', text: line })
        }
      }

      child.stdout.on('data', (data: Buffer) => {
        stdoutBuffer += data.toString()

        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() ?? ''
        for (const line of lines) {
          processLine(line)
        }
      })

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
        process.stderr.write(data)
      })

      child.on('error', (error) => {
        reject(
          new Error(
            `OpenCode CLI failed to start: ${error.message}. Make sure 'opencode' is installed and in PATH.`,
          ),
        )
      })

      child.on('close', (code) => {
        if (stdoutBuffer.trim()) {
          processLine(stdoutBuffer)
        }

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
          reject(
            new Error(
              `OpenCode CLI exited with code ${code}. stderr: ${stderr}`,
            ),
          )
          return
        }

        if (openCodeError) {
          reject(new Error(openCodeError))
          return
        }

        resolve({
          steps,
          totalCostUsd,
          diff,
        })
      })
    })
  }
}
