import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import path from 'path'

import { describe, expect, it } from 'bun:test'

import { CodebuffClient } from '../client'
import { loadLocalAgents } from '../agents/load-agents'

import type { AgentOutput } from '@codebuff/common/types/session-state'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

const DEFAULT_TIMEOUT_MS = 120_000
const EXPECTED_KEYWORD = 'useActionState'

function loadEnvValue(name: string): string | undefined {
  if (process.env[name] && process.env[name] !== 'test') {
    return process.env[name]
  }

  for (const envPath of [
    path.join(homedir(), 'codebuff', '.env.local'),
    path.join(process.cwd(), '.env.local'),
  ]) {
    if (!existsSync(envPath)) continue

    const contents = readFileSync(envPath, 'utf8')
    const match = contents.match(new RegExp(`^${name}=(.*)$`, 'm'))
    const value = match?.[1]?.trim().replace(/^['"]|['"]$/g, '')
    if (value && value !== 'test') return value
  }

  return undefined
}

function extractOutputText(output: AgentOutput): string {
  if (output.type === 'error') return output.message
  if (output.type === 'structuredOutput') {
    return JSON.stringify(output.value ?? {})
  }

  const assistantText = output.value.flatMap((message) => {
    if ((message as { role?: unknown }).role !== 'assistant') return []

    const content = (message as { content?: unknown }).content
    if (typeof content === 'string') return [content]
    if (!Array.isArray(content)) return []

    return content.flatMap((part) => {
      if (
        part &&
        typeof part === 'object' &&
        'type' in part &&
        part.type === 'text' &&
        'text' in part
      ) {
        return [String(part.text)]
      }
      return []
    })
  })

  return assistantText.join('\n')
}

describe('researcher-web SDK integration', () => {
  it(
    `runs researcher-web through the SDK and answers with ${EXPECTED_KEYWORD}`,
    async () => {
      const apiKey = loadEnvValue('CODEBUFF_API_KEY')
      if (!apiKey) {
        console.log(
          'Skipping researcher-web SDK integration test: set CODEBUFF_API_KEY to run.',
        )
        return
      }

      const agentsPath = path.resolve(
        import.meta.dir,
        '../../../agents/researcher',
      )
      const loadedAgents = await loadLocalAgents({ agentsPath })
      const researcherWeb = loadedAgents['researcher-web']
      expect(researcherWeb).toBeDefined()

      const events: PrintModeEvent[] = []
      const client = new CodebuffClient({
        apiKey,
        cwd: process.cwd(),
      })

      const result = await client.run({
        agent: 'researcher-web',
        agentDefinitions: [researcherWeb],
        maxAgentSteps: 8,
        handleEvent: (event) => {
          events.push(event)
        },
        prompt: [
          'Use web search to answer this React docs question.',
          'After searching, fetch the most relevant React docs page with run_terminal_command before answering.',
          'In React 19, which hook returns state, a form action, and an isPending value for form actions?',
          'Answer with the exact hook name and one short sentence.',
        ].join(' '),
      })

      const outputText = extractOutputText(result.output)
      console.log('researcher-web SDK output:', outputText)

      expect(result.output.type).not.toBe('error')
      expect(outputText).toContain(EXPECTED_KEYWORD)
      expect(events.some((event) => event.type === 'tool_call')).toBe(true)
      expect(
        events.some(
          (event) =>
            event.type === 'tool_call' && event.toolName === 'web_search',
        ),
      ).toBe(true)
      expect(
        events.some(
          (event) =>
            event.type === 'tool_call' &&
            event.toolName === 'run_terminal_command',
        ),
      ).toBe(true)
    },
    DEFAULT_TIMEOUT_MS,
  )
})
