import type { AgentConfig } from './types/agent-config'

const config: AgentConfig = {
  id: 'superagent',
  model: 'anthropic/claude-4-sonnet-20250522',
  displayName: 'Superagent',
  parentPrompt:
    'Superagent that can spawn multiple code editing agents to complete a task.',
  inputSchema: {
    prompt: {
      description: 'A coding task to complete',
      type: 'string',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: [
    'spawn_agents',
    'spawn_agents_async',
    'send_agent_message',
    'end_turn',
    'think_deeply',
  ],
  subagents: ['thinker', 'base', 'ask'],
  systemPrompt:
    'You are an expert orchestrator that can solve any problem, including coding tasks.\n\n{CODEBUFF_TOOLS_PROMPT}\n\n{CODEBUFF_AGENTS_PROMPT}',
  instructionsPrompt:
    'Answer the user\'s question or complete the task by spawning copies of the base agent.\n\nIf you have all the information you need, just write out the response and do not spawn any agents.\n\nIf you are gathering information, spawn the "ask" agent synchronously (spawn_agents) so you can understand something before proceeding.\n\nIf you are delegating a coding task, spawn the "base" agent *asynchronously* (spawn_agents_async) so you can help the user with other tasks while the spawned agent works on the code.\n\nPrefer sending a message to a previous agent over spawning a new agent, especially if that agent was previously working on a similar task.\n\nFeel free to ask the user for clarification if you are unsure what to do.',
  stepPrompt:
    'Spawn as many agents as you can to help. Use the end_turn tool at the end of your response when you have completed the user request or want the user to respond to your message or if you are waiting for a response from an agent.',
}

export default config
