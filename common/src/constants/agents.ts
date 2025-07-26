// Define agent personas with their shared characteristics
export const AGENT_PERSONAS = {
  // Base agents - all use Buffy persona
  base: {
    displayName: 'Buffy the Enthusiastic Coding Assistant',
    purpose: 'Base agent that orchestrates the full response.',
  },
  base_lite: {
    displayName: 'Buffy the Enthusiastic Coding Assistant',
    purpose: 'Base agent that orchestrates the full response.',
  },
  base_max: {
    displayName: 'Buffy the Enthusiastic Coding Assistant',
    purpose: 'Base agent that orchestrates the full response.',
  },
  base_experimental: {
    displayName: 'Buffy the Enthusiastic Coding Assistant',
    purpose: 'Base agent that orchestrates the full response.',
  },
  claude4_gemini_thinking: {
    displayName: 'Buffy the Enthusiastic Coding Assistant',
    purpose: 'Base agent that orchestrates the full response.',
  },

  superagent: {
    displayName: 'Superagent',
    purpose:
      'Superagent that can spawn multiple code editing agents to complete a task.',
  },

  // Ask mode
  ask: {
    displayName: 'Buffy the Enthusiastic Coding Assistant',
    purpose: 'Base ask-mode agent that orchestrates the full response.',
  },

  // Specialized agents
  thinker: {
    displayName: 'Theo the Theorizer',
    purpose:
      'Does deep thinking given the current messages and a specific prompt to focus on. Use this to help you solve a specific problem.',
  },
  file_explorer: {
    displayName: 'Dora The File Explorer',
    purpose: 'Expert at exploring a codebase and finding relevant files.',
  },
  file_picker: {
    displayName: 'Fletcher the File Fetcher',
    purpose: 'Expert at finding relevant files in a codebase.',
  },
  researcher: {
    displayName: 'Reid Searcher the Researcher',
    purpose: 'Expert at researching topics using web search and documentation.',
  },
  planner: {
    displayName: 'Peter Plan the Planner',
    purpose: 'Agent that formulates a comprehensive plan to a prompt.',
    hidden: true,
  },
  dry_run: {
    displayName: 'Sketch the Dry Runner',
    purpose: 'Agent that takes a plan and try to implement it in a dry run.',
    hidden: true,
  },
  reviewer: {
    displayName: 'Nit Pick Nick the Reviewer',
    purpose:
      'Reviews file changes and responds with critical feedback. Use this after making any significant change to the codebase.',
  },
  sonnet4_agent_builder: {
    displayName: 'Agna the Agent Builder',
    purpose: 'Creates new agent templates for the codebuff mult-agent system',
    hidden: true,
  },
} as const

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
    persona.displayName,
  ])
) as Record<keyof typeof AGENT_PERSONAS, string>

export type AgentName =
  (typeof AGENT_PERSONAS)[keyof typeof AGENT_PERSONAS]['displayName']

// Get unique agent names for UI display
export const UNIQUE_AGENT_NAMES = Array.from(
  new Set(
    Object.values(AGENT_PERSONAS)
      .filter((persona) => !(persona as any).hidden)
      .map((persona) => persona.displayName)
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
