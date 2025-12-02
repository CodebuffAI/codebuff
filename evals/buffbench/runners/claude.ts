import { execSync, spawn } from 'child_process'

import type { Runner, RunnerResult, AgentStep } from './runner'
import type {
  PrintModeToolCall,
  PrintModeToolResult,
} from '@codebuff/common/types/print-mode'

export class ClaudeRunner implements Runner {
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
      const args = [
        '-p',
        prompt,
        '--output-format',
        'stream-json',
        '--verbose',
        '--dangerously-skip-permissions',
        '--model',
        'opus',
      ]

      console.log(`[ClaudeRunner] Running: claude ${args.join(' ')}`)

      const child = spawn('claude', args, {
        cwd: this.cwd,
        env: {
          ...process.env,
          ...this.env,
          // Ensure ANTHROPIC_API_KEY is set from CLAUDE_CODE_KEY if available
          ANTHROPIC_API_KEY:
            process.env.CLAUDE_CODE_KEY || process.env.ANTHROPIC_API_KEY,
        },
        // Use 'ignore' for stdin to prevent the CLI from waiting for input
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      let responseText = ''
      let toolCalls: PrintModeToolCall[] = []
      let toolResults: PrintModeToolResult[] = []

      function flushStep() {
        if (responseText.length > 0) {
          steps.push({ type: 'text', text: responseText })
        }
        for (const call of toolCalls) {
          steps.push(call)
        }
        for (const result of toolResults) {
          steps.push(result)
        }
        responseText = ''
        toolCalls = []
        toolResults = []
      }

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString()
        stdout += chunk

        // Parse streaming JSON output from Claude CLI
        const lines = chunk.split('\n').filter((line) => line.trim())
        for (const line of lines) {
          try {
            const event = JSON.parse(line)

            if (event.type === 'assistant') {
              if (event.message?.content) {
                for (const content of event.message.content) {
                  if (content.type === 'text') {
                    if (toolResults.length > 0) {
                      flushStep()
                    }
                    responseText += content.text
                    process.stdout.write(content.text)
                  } else if (content.type === 'tool_use') {
                    toolCalls.push({
                      type: 'tool_call',
                      toolName: content.name,
                      toolCallId: content.id,
                      input: content.input || {},
                    })
                  }
                }
              }
            } else if (event.type === 'user') {
              if (event.message?.content) {
                for (const content of event.message.content) {
                  if (content.type === 'tool_result') {
                    toolResults.push({
                      type: 'tool_result',
                      toolName: 'unknown',
                      toolCallId: content.tool_use_id,
                      output: [
                        {
                          type: 'json',
                          value:
                            typeof content.content === 'string'
                              ? content.content
                              : content.content,
                        },
                      ],
                    })
                  }
                }
              }
            } else if (event.type === 'result') {
              if (event.total_cost_usd) {
                totalCostUsd += event.total_cost_usd
              }
            }
          } catch {
            // Not JSON, might be plain text output
            responseText += line
          }
        }
      })

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
        process.stderr.write(data)
      })

      child.on('error', (error) => {
        reject(
          new Error(
            `Claude CLI failed to start: ${error.message}. Make sure 'claude' is installed and in PATH.`,
          ),
        )
      })

      child.on('close', (code) => {
        flushStep()

        // Get git diff after Claude has made changes
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
            new Error(`Claude CLI exited with code ${code}. stderr: ${stderr}`),
          )
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
