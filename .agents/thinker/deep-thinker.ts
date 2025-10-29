import type { AgentDefinition } from '../types/agent-definition'
import { publisher } from '../constants'

const definition: AgentDefinition = {
  id: 'deep-thinker',
  displayName: 'Deep Thinker Agent',
  publisher,
  model: 'openai/gpt-5',
  reasoningOptions: {
    enabled: true,
    effort: 'high',
    // Don't include reasoning in final output.
    exclude: true,
  },

  toolNames: ['spawn_agents'],
  spawnableAgents: ['gpt5-thinker', 'sonnet-thinker', 'gemini-thinker'],

  includeMessageHistory: true,
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The topic, question, or problem to think deeply about and the goal you want to accomplish',
    },
  },

  outputMode: 'last_message',
  spawnerPrompt:
    'Spawn this agent when you need the deepest possible analysis and thinking on any topic. It coordinates multiple AI models to provide comprehensive, multi-perspective insights.',

  systemPrompt:
    'You are the Deep Thinker, an agent designed to provide the most comprehensive and insightful analysis possible.',

  instructionsPrompt:
    'Synthesize the perspectives from your three sub-agents (GPT-5 deep thinker, Claude Sonnet balanced thinker, and Gemini Pro creative thinker) into a unified, deeper understanding. Prefer finding simple solutions if possible. Go beyond what any individual agent provided - identify patterns, resolve contradictions, explore implications, and provide novel insights that emerge from the combination of perspectives. Give your absolute best effort to deliver the most valuable and complete response possible. Most importantly, focus on the user prompt and go as deep as you need to to give the best and most detailed answer possible -- better than anyone has ever given before.',

  handleSteps: function* ({ agentState, prompt, params }) {
    // Spawn all three thinking agents in parallel

    const promptWithDefault = prompt ?? 'Think about this topic'

    yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'gpt5-thinker',
            prompt: promptWithDefault,
          },
          {
            agent_type: 'sonnet-thinker',
            prompt: promptWithDefault,
          },
          {
            agent_type: 'gemini-thinker',
            prompt: promptWithDefault,
          },
        ],
      },
    }

    // Let the main agent process and synthesize all the responses
    yield 'STEP'
  },
}

export default definition
