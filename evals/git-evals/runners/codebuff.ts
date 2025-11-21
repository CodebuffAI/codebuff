import path from 'path'

import { MAX_AGENT_STEPS_DEFAULT } from '@codebuff/common/constants/agents'
import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { loadLocalAgents } from '@codebuff/npm-app/agents/load-agents'
import { getUserCredentials } from '@codebuff/npm-app/credentials'

import { CodebuffClient, type RunState } from '@codebuff/sdk'

import type { Runner } from './runner'
import type { AgentStep } from '../../scaffolding'

const getLocalAuthToken = () => {
  return getUserCredentials()?.authToken
}

export class CodebuffRunner implements Runner {
  private runState: RunState
  private agent: string

  constructor(runState: RunState, agent?: string) {
    this.runState = runState
    this.agent = agent ?? 'base'
  }

  async run(prompt: string): ReturnType<Runner['run']> {
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

    const apiKey = process.env[API_KEY_ENV_VAR] || getLocalAuthToken()

    const client = new CodebuffClient({
      apiKey,
      cwd: this.runState.sessionState.fileContext.cwd,
    })

    const agentsPath = path.join(__dirname, '../../../.agents')
    const localAgentDefinitions = Object.values(
      await loadLocalAgents({
        agentsPath,
      }),
    )
    console.log(
      '[CodebuffRunner] Loaded local agent definitions:',
      localAgentDefinitions.map((a) => a.id),
    )

    let lastErrorMessage = ''
    this.runState = await client.run({
      agent: this.agent,
      previousRun: this.runState,
      prompt,
      handleEvent: (event) => {
        if (event.type === 'error') {
          console.log(
            '[CodebuffRunner] ERROR event:',
            JSON.stringify(event, null, 2),
          )
          lastErrorMessage = event.message
        }
        if (event.type === 'text') {
          if (toolResults.length > 0) {
            flushStep()
            console.log('\n')
          }
          responseText += event.text
        } else if (event.type === 'tool_call') {
          if (event.toolName === 'set_messages') {
            return
          }
          toolCalls.push(event as any)
        } else if (event.type === 'tool_result') {
          toolResults.push(event as any)
          console.log('\n\n' + JSON.stringify(event, null, 2))
        } else if (event.type === 'finish') {
          if (
            responseText.length > 0 ||
            toolCalls.length > 0 ||
            toolResults.length > 0
          ) {
            flushStep()
          }
        }
      },
      handleStreamChunk: (chunk) => {
        if (typeof chunk !== 'string') {
          return
        }
        process.stdout.write(chunk)
      },
      maxAgentSteps: MAX_AGENT_STEPS_DEFAULT,
      agentDefinitions: localAgentDefinitions,
    })
    flushStep()

    return {
      steps,
      totalCostUsd: this.runState.sessionState.mainAgentState.creditsUsed / 100,
    }
  }
}
