import { DynamicAgentConfig } from '@codebuff/common/types/dynamic-agent-template'
import { z } from 'zod/v4'

export default {
  id: 'brainstormer',
  version: '1.0.0',
  override: false,

  displayName: 'Brian the Brainstormer',
  purpose:
    'Acts as a creative thought partner, generating ideas and exploring alternative viewpoints to help think through problems.',
  model: 'anthropic/claude-4-sonnet-20250522',
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['end_turn'],
  spawnableAgents: ['thinker', 'researcher'],
  parentInstructions: {
    base: 'Spawn brainstormer when you need creative alternatives, want to challenge assumptions, or explore different approaches to implementation problems',
    base_lite:
      "Use brainstormer for quick creative insights when you're stuck or need fresh perspectives on simple problems",
    base_max:
      'Leverage brainstormer for deep creative exploration of complex problems with multiple potential solution paths',
    thinker:
      'Collaborate with brainstormer when analytical thinking needs creative angles or assumption challenging',
    researcher:
      'Use brainstormer to suggest creative search angles and alternative information sources for research',
    reviewer:
      'Engage brainstormer for creative problem-solving approaches to code review and innovative improvement suggestions',
  },
  promptSchema: {
    prompt: z.toJSONSchema(
      z.string().describe('The problem or topic to brainstorm about.')
    ),
  },

  systemPrompt: {
    path: '.agents/templates/brainstormer-system.md',
  },

  instructionsPrompt:
    'Act as a creative thought partner. Generate multiple perspectives, challenge assumptions, explore alternatives, and ask probing questions to help think through problems more thoroughly.',
  stepPrompt:
    "Continue brainstorming and exploring ideas. When you're done, use the end_turn tool: ",
} satisfies DynamicAgentConfig
