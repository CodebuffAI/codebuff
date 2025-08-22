import { CodebuffClient } from '../../../sdk/src/index'

import type { Runner } from './runner'
import type { RunState } from '../../../sdk/src/index'
import type { AgentStep } from '../../scaffolding'

export class CodebuffRunner implements Runner {
  private client: CodebuffClient | null
  private runState: RunState
  private agent: string

  constructor(runState: RunState, agent?: string) {
    this.client = null
    this.runState = runState
    this.agent = agent ?? 'base'
  }

  async run(prompt: string): Promise<{ steps: AgentStep[] }> {
    const steps: AgentStep[] = []
    let responseText = ''
    let toolCalls: AgentStep['toolCalls'] = []
    let toolResults: AgentStep['toolResults'] = []
    function flushStep() {
      steps.push({ response: responseText, toolCalls, toolResults })
      responseText = ''
      toolCalls = []
      toolResults = []
    }

    if (!this.client) {
      this.client = new CodebuffClient({
        cwd: this.runState.sessionState.fileContext.cwd,
        onError: (error) => {
          throw new Error(error.message)
        },
      })
    }

    this.runState = await this.client.run({
      agent: this.agent,
      previousRun: this.runState,
      prompt,
      handleEvent: (event) => {
        if (event.type === 'error') {
          throw new Error(event.message)
        }
        if (event.type === 'text') {
          if (toolResults.length > 0) {
            flushStep()
            console.log('\n')
          }
          responseText += event.text
        } else if (event.type === 'tool_call') {
          toolCalls.push(event as any)
        } else if (event.type === 'tool_result') {
          toolResults.push(event as any)
          console.log('\n\n' + JSON.stringify(event, null, 2))
        }
      },
      handleStreamChunk: (chunk) => {
        process.stdout.write(chunk)
      },
      maxAgentSteps: 20,
    })
    flushStep()

    return { steps }
  }
}
