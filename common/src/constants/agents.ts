// Define agent personas with their shared characteristics
export const AGENT_PERSONAS = {
  // Base agents - all use Buffy persona
  base: {
    name: 'Buffy the Enthusiastic Coding Assistant',
    purpose: 'Base agent that orchestrates the full response.',
  } as const,
  base_lite: {
    name: 'Buffy the Enthusiastic Coding Assistant',
    purpose: 'Base agent that orchestrates the full response.',
  } as const,
  base_max: {
    name: 'Buffy the Enthusiastic Coding Assistant',
    purpose: 'Base agent that orchestrates the full response.',
  } as const,
  base_experimental: {
    name: 'Buffy the Enthusiastic Coding Assistant',
    purpose: 'Base agent that orchestrates the full response.',
  } as const,
  claude4_gemini_thinking: {
    name: 'Buffy the Enthusiastic Coding Assistant',
    purpose: 'Base agent that orchestrates the full response.',
  } as const,

  superagent: {
    name: 'Superagent',
    purpose:
      'Superagent that can spawn multiple code editing agents to complete a task.',
  } as const,

  // Ask mode
  ask: {
    name: 'Buffy the Enthusiastic Coding Assistant',
    purpose: 'Base ask-mode agent that orchestrates the full response.',
  } as const,

  // Specialized agents
  thinker: {
    name: 'Theo the Theorizer',
    purpose:
      'Does deep thinking given the current messages and a specific prompt to focus on. Use this to help you solve a specific problem.',
  } as const,
  file_explorer: {
    name: 'Dora The File Explorer',
    purpose: 'Expert at exploring a codebase and finding relevant files.',
  } as const,
  file_picker: {
    name: 'Fletcher the File Fetcher',
    purpose: 'Expert at finding relevant files in a codebase.',
  } as const,
  researcher: {
    name: 'Reid Searcher the Researcher',
    purpose: 'Expert at researching topics using web search and documentation.',
  } as const,
  planner: {
    name: 'Peter Plan the Planner',
    purpose: 'Agent that formulates a comprehensive plan to a prompt.',
    hidden: true,
  } as const,
  dry_run: {
    name: 'Sketch the Dry Runner',
    purpose: 'Agent that takes a plan and try to implement it in a dry run.',
    hidden: true,
  } as const,
  reviewer: {
    name: 'Nit Pick Nick the Reviewer',
    purpose:
      'Reviews file changes and responds with critical feedback. Use this after making any significant change to the codebase.',
  } as const,
  sonnet4_agent_builder: {
    name: 'Bob the Agent Builder',
    purpose: 'Creates new agent templates for the codebuff mult-agent system',
    hidden: false,
  } as const,
} as const satisfies Record<
  string,
  { name: string; purpose: string; hidden?: boolean }
>

// Agent IDs list from AGENT_PERSONAS keys
export const AGENT_IDS = Object.keys(
  AGENT_PERSONAS
) as (keyof typeof AGENT_PERSONAS)[]

// Agent ID prefix constant
export const AGENT_ID_PREFIX = 'CodebuffAI/'

// Agent names for client-side reference
export const AGENT_NAMES = Object.fromEntries(
  Object.entries(AGENT_PERSONAS).map(([agentType, persona]) => [
    agentType,
    persona.name,
  ])
) as Record<keyof typeof AGENT_PERSONAS, string>

export type AgentName =
  (typeof AGENT_PERSONAS)[keyof typeof AGENT_PERSONAS]['name']

// Get unique agent names for UI display
export const UNIQUE_AGENT_NAMES = Array.from(
  new Set(
    Object.values(AGENT_PERSONAS)
      .filter((persona) => !('hidden' in persona) || !persona.hidden)
      .map((persona) => persona.name)
  )
)

// Map from display name back to agent types (for parsing user input)
export const AGENT_NAME_TO_TYPES = Object.entries(AGENT_NAMES).reduce(
  (acc, [type, name]) => {
    if (!acc[name]) acc[name] = []
    acc[name].push(type)
    return acc
  },
  {} as Record<string, string[]>
)
