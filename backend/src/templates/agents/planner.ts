import z from 'zod/v4'
import { Model } from '@codebuff/common/constants'
import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import { closeXml } from '@codebuff/common/util/xml'
import { AgentTemplate, baseAgentStopSequences, PLACEHOLDER } from '../types'

export const planner = (model: Model): Omit<AgentTemplate, 'id'> => ({
  model,
  name: AGENT_PERSONAS['planner'].name,
  implementation: 'llm',
  description: AGENT_PERSONAS['planner'].description,
  promptSchema: {
    prompt: z
      .string()
      .describe(
        'What problem you to solve and a few ideas and suggestions for the plan'
      ),
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['think_deeply', 'spawn_agents', 'end_turn'],
  stopSequences: baseAgentStopSequences,
  spawnableAgents: [], // ARCHIVED: [AgentTemplateTypes.dry_run],
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt: `# Persona: ${PLACEHOLDER.AGENT_NAME}

You are an expert software architect. You are good at creating comprehensive plans to tackle the user request.\n\n${PLACEHOLDER.TOOLS_PROMPT}`,

  userInputPrompt: `Steps for your response:
1. Use the <think_deeply> tool to think through cruxes for the plan, and tricky cases. Consider alternative approaches. Be sure to close the tool call with ${closeXml('think_deeply')}.
2. Write out your plan in a concise way.
3. Spawn 1-5 dry run agents to sketch portions of the implementation of the plan. (Important: do not forget to close the tool call with "${closeXml('spawn_agents')}"!)
4. Synthesize all the information and rewrite the full plan to be the best it can be. Use the end_turn tool.`,

  agentStepPrompt:
    'Do not forget to use the end_turn tool to end your response. Make sure the final plan is the best it can be.',
})
