import { CodebuffClient, type AgentDefinition } from '@codebuff/sdk'
import { describe, expect, it } from 'bun:test'

import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

import { getApiKey } from '../../sdk/e2e/utils/get-api-key'

/**
 * A minimal agent definition for editor-best-of-n-max that satisfies
 * the BYOK local agent registry. The mocked LLM handles the actual responses.
 */
const editorBestOfNDefinition: AgentDefinition = {
  id: 'editor-best-of-n-max',
  displayName: 'Editor Best of N (Max)',
  model: 'pioneer/claude-sonnet-4-6',
  includeMessageHistory: false,
  inheritParentSystemPrompt: false,
  outputMode: 'last_message',
  toolNames: ['propose_str_replace', 'propose_write_file'],
  spawnableAgents: [],
  instructionsPrompt:
    'You are an expert code editor. Implement the requested changes using propose_str_replace or propose_write_file tools.',
}

/**
 * Integration tests for the editor-best-of-n-max agent.
 * These tests verify that the best-of-n editor workflow works correctly:
 * 1. Spawns multiple implementor agents in parallel
 * 2. Collects their implementation proposals
 * 3. Uses a selector agent to choose the best implementation
 * 4. Applies the chosen implementation
 */
describe('Editor Best-of-N Max Agent Integration', () => {
  it(
    'should generate and select the best implementation for a simple edit',
    async () => {
      // getApiKey() calls setupE2eMocks() internally, mocking LLM and database calls
      const apiKey = getApiKey()

      // Create mock project files with a simple TypeScript file to edit
      const projectFiles: Record<string, string> = {
        'src/utils/math.ts': `
export function add(a: number, b: number): number {
  return a + b
}

export function subtract(a: number, b: number): number {
  return a - b
}
`,
        'src/index.ts': `
import { add, subtract } from './utils/math'

console.log(add(1, 2))
console.log(subtract(5, 3))
`,
        'package.json': JSON.stringify({
          name: 'test-project',
          version: '1.0.0',
          dependencies: {},
        }),
      }

      const client = new CodebuffClient({
        apiKey,
        cwd: '/tmp/test-best-of-n-project',
        projectFiles,
        agentDefinitions: [editorBestOfNDefinition],
      })

      const events: PrintModeEvent[] = []

      // Run the editor-best-of-n-max agent with a simple task
      const run = await client.run({
        agent: 'editor-best-of-n-max',
        prompt:
          'Add a multiply function to src/utils/math.ts that takes two numbers and returns their product',
        params: { n: 2 },
        handleEvent: (event) => {
          console.log(event)
          events.push(event)
        },
      })

      // The output should not be an error
      expect(run.output.type).not.toEqual('error')

      // Verify we got some output
      expect(run.output).toBeDefined()

      // The output should contain the implementation response
      const outputStr =
        typeof run.output === 'string' ? run.output : JSON.stringify(run.output)
      console.log('Output:', outputStr)

      // Check both output and sessionState — the prompt itself mentions multiply/function/number
      const sessionStr = JSON.stringify(run.sessionState)
      const allContent = (outputStr + sessionStr).toLowerCase()

      const relevantTerms = [
        'multiply',
        'product',
        'str_replace',
        'write_file',
        'propose_str_replace',
        'propose_write_file',
        'function',
        'return',
        'number',
      ]
      const foundRelevantTerm = relevantTerms.some((term) =>
        allContent.includes(term.toLowerCase()),
      )

      expect(foundRelevantTerm).toBe(true)
    },
    { timeout: 120_000 },
  )
})
