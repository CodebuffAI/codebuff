/**
 * E2E smoke test for gravity_index in the freebuff.com/chat agent.
 *
 * Mirrors src/server/chat/agent.ts: runs base-chat through the SDK with the
 * chat's DeepSeek backend model, sends a service-recommendation prompt, and
 * logs the normalized events the chat UI would receive.
 *
 * Run from freebuff/web with env loaded:
 *   sh -c 'set -a; source ../../.env.local; set +a; \
 *     NEXT_PUBLIC_CODEBUFF_APP_URL=http://localhost:3019 \
 *     bun scripts/test-chat-gravity.ts "<prompt>"'
 */
import { run } from '@codebuff/sdk'

import baseChatAgent from '../../../agents/base-chat'
import researcherWebAgent from '../../../agents/researcher/researcher-web'
import { CHAT_MODELS } from '../src/app/chat/models'

import type { AgentDefinition } from '@codebuff/sdk'

const prompt =
  process.argv[2] ??
  'What service should I use to send transactional emails from my Next.js app? Just need a quick recommendation.'

const apiKey = process.env.CODEBUFF_API_KEY
if (!apiKey) throw new Error('CODEBUFF_API_KEY not set')

const agent = {
  ...baseChatAgent,
  model: CHAT_MODELS[0].backendId,
} as AgentDefinition

const result = await run({
  apiKey,
  fingerprintId: 'freebuff-chat-test-script',
  agent,
  agentDefinitions: [researcherWebAgent as AgentDefinition],
  projectFiles: {},
  knowledgeFiles: {},
  maxAgentSteps: 10,
  prompt,
  costMode: 'normal',
  handleStreamChunk: (chunk) => {
    if (typeof chunk === 'string') process.stdout.write(chunk)
  },
  handleEvent: (event) => {
    if (event.type === 'tool_call') {
      console.log(
        `\n[tool_call] ${event.toolName} agentId=${event.agentId ?? '(none)'} input=${JSON.stringify(event.input).slice(0, 300)}`,
      )
    } else if (event.type === 'tool_result') {
      console.log(
        `\n[tool_result] ${event.toolName} output=${JSON.stringify(event.output).slice(0, 500)}`,
      )
    } else if (event.type === 'subagent_start') {
      console.log(`\n[subagent_start] ${event.agentType} (${event.agentId})`)
    }
  },
})

console.log('\n\n=== run output ===')
console.log(JSON.stringify(result.output, null, 2).slice(0, 3000))
