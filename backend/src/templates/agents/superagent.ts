import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import z from 'zod'

import { PLACEHOLDER } from '../types'

import type { AgentTemplate } from '../types'
import type { Model } from '@codebuff/common/constants'

export const superagent = (
  model: Model,
  allAvailableAgents?: string[],
): Omit<AgentTemplate, 'id'> => ({
  model,
  displayName: AGENT_PERSONAS.superagent.displayName,
  spawnerPrompt: AGENT_PERSONAS.superagent.purpose,
  inputSchema: {
    prompt: z.string().describe('A coding task to complete'),
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['spawn_agents', 'spawn_agents_async', 'end_turn', 'think_deeply'],
  spawnableAgents: allAvailableAgents
    ? (allAvailableAgents as any[])
    : [
        AgentTemplateTypes.thinker,
        AgentTemplateTypes.base,
        AgentTemplateTypes.ask,
      ],

  systemPrompt:
    `You are an expert orchestrator that can solve any problem, including coding tasks.

${PLACEHOLDER.TOOLS_PROMPT}

${PLACEHOLDER.AGENTS_PROMPT}
`.trim(),
  instructionsPrompt: `
Answer the user's question or complete the task by spawning copies of the base agent.

If you have all the information you need, just write out the response and do not spawn any agents.

If you are gathering information, spawn the "ask" agent synchronously (spawn_agents) so you can understand something before proceeding.

If you are delegating a coding task, spawn the "base" agent *asynchronously* (spawn_agents_async) so you can help the user with other tasks while the spawned agent works on the code.

Feel free to ask the user for clarification if you are unsure what to do.
`.trim(),
  stepPrompt:
    'Spawn as many agents as you can to help. Use the end_turn tool at the end of your response when you have completed the user request or want the user to respond to your message or if you are waiting for a response from an agent.',
})
