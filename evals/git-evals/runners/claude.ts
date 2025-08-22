import { query } from '@anthropic-ai/claude-code'

import type { Runner } from './runner'
import type { AgentStep } from '../../scaffolding'
import type { Query } from '@anthropic-ai/claude-code'

export class ClaudeRunner implements Runner {
  private cwd: string
  private firstRun: boolean

  constructor(cwd: string) {
    this.firstRun = true
    this.cwd = cwd
  }

  async run(prompt: string): Promise<{ steps: AgentStep[] }> {
    const response: Query = query({
      prompt,
      options: {
        continue: !this.firstRun,
        cwd: this.cwd,
        permissionMode: 'bypassPermissions',
      },
    })

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

    for await (const chunk of response) {
      if (chunk.type === 'user') {
        if (typeof chunk.message.content === 'string') {
          responseText += chunk.message.content
          console.log(`\n\nUser: ${chunk.message.content}`)
        } else {
          chunk.message.content.forEach((content) => {
            if (content.type === 'text') {
              responseText += content.text
              console.log(`\n\nUser: ${content.text}`)
            } else if (content.type === 'tool_result') {
              console.log(
                `\n\nTool result: ${JSON.stringify(content, null, 2)}`,
              )
              toolResults.push(content)
            }
          })
        }
      } else if (chunk.type === 'assistant') {
        chunk.message.content.forEach((content) => {
          if (content.type === 'text') {
            if (toolResults.length > 0) {
              flushStep()
            }
            console.log(`\n\nAssistant: ${content.text}`)
            responseText += content.text
          } else if (content.type === 'tool_use') {
            console.log(
              `\n\nAssistant tool use: ${JSON.stringify(content, null, 2)}`,
            )
            toolCalls.push(content)
          } else if (content.type === 'thinking') {
            console.log(`\n\nAssistant thinking: ${content.thinking}`)
          } else {
            console.log(
              `\n\nUnprocessed assistant content: ${JSON.stringify(content, null, 2)}`,
            )
          }
        })
      } else if (chunk.type === 'system') {
        console.log(`\n\nSystem: ${JSON.stringify(chunk, null, 2)}`)
      } else if (chunk.type === 'result') {
        console.log(`\n\nResult: ${JSON.stringify(chunk, null, 2)}`)
      } else {
        chunk satisfies never
        const chunkAny = chunk as any
        console.log(
          `\n\nUnprocessed chunk (${chunkAny.type}) ${JSON.stringify(chunkAny, null, 2)}`,
        )
      }
    }

    flushStep()

    return { steps }
  }
}
