/**
 * E2E smoke test for the thinker-gemini spawn path in freebuff.com/chat.
 *
 * Mirrors src/server/chat/agent.ts: runs base-chat with researcher-web AND
 * thinker-gemini registered, and logs subagent lifecycle + reasoning chunks
 * so we can see whether the thinker spawns and whether its reasoning streams.
 *
 * Run from freebuff/web with env loaded:
 *   sh -c 'set -a; source ../../.env.local; set +a; \
 *     NEXT_PUBLIC_CODEBUFF_APP_URL=http://localhost:3000 \
 *     bun scripts/test-chat-thinker.ts "<prompt>"'
 */
import { run } from '@codebuff/sdk'

import baseChatAgent from '../../../agents/base-chat'
import researcherWebAgent from '../../../agents/researcher/researcher-web'
import thinkerGeminiAgent from '../../../agents/thinker/thinker-gemini'
import { CHAT_MODELS } from '../src/app/chat/models'

import type { AgentDefinition } from '@codebuff/sdk'

const prompt =
  process.argv[2] ??
  'Use your thinker-gemini deep-thinking agent to reason through this, then answer: in a knockout tournament with 137 players, how many matches are played?'

const apiKey = process.env.CODEBUFF_API_KEY
if (!apiKey) throw new Error('CODEBUFF_API_KEY not set')

const agent = {
  ...baseChatAgent,
  model: CHAT_MODELS[1].backendId, // Smartest / DeepSeek Pro
} as AgentDefinition

console.log('spawnableAgents:', baseChatAgent.spawnableAgents)
console.log('thinker id:', thinkerGeminiAgent.id, 'model:', thinkerGeminiAgent.model)

let reasoningSubagentChars = 0

const result = await run({
  apiKey,
  fingerprintId: 'freebuff-chat-thinker-test',
  agent,
  agentDefinitions: [
    researcherWebAgent as AgentDefinition,
    thinkerGeminiAgent as AgentDefinition,
  ],
  projectFiles: {},
  knowledgeFiles: {},
  maxAgentSteps: 12,
  prompt,
  costMode: 'normal',
  handleStreamChunk: (chunk) => {
    if (typeof chunk === 'object' && chunk?.type === 'reasoning_chunk') {
      if (chunk.ancestorRunIds.length > 0) {
        reasoningSubagentChars += chunk.chunk.length
        process.stdout.write(`\x1b[2m${chunk.chunk}\x1b[0m`)
      }
    }
  },
  handleEvent: (event) => {
    if (event.type === 'subagent_start') {
      console.log(
        `\n[subagent_start] type=${event.agentType} name=${event.displayName} prompt=${JSON.stringify(event.prompt ?? '').slice(0, 200)}`,
      )
    } else if (event.type === 'subagent_finish') {
      console.log(`\n[subagent_finish] ${event.agentId}`)
    } else if (event.type === 'tool_call') {
      console.log(
        `\n[tool_call] ${event.toolName} agentId=${event.agentId ?? '(root)'} input=${JSON.stringify(event.input).slice(0, 200)}`,
      )
    }
  },
})

console.log('\n\n=== subagent reasoning chars:', reasoningSubagentChars, '===')
console.log('=== run output ===')
console.log(JSON.stringify(result.output, null, 2).slice(0, 1500))
