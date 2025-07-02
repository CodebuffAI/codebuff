// Define agent personas with their shared characteristics
export const AGENT_PERSONAS = {
  // Base agents - all use Buffy persona
  opus4_base: {
    name: 'Buffy',
    title: 'The Enthusiastic Coding Assistant',
    description: 'Base agent that orchestrates the full response.',
  },
  claude4_base: {
    name: 'Buffy',
    title: 'The Enthusiastic Coding Assistant',
    description: 'Base agent that orchestrates the full response.',
  },
  gemini25pro_base: {
    name: 'Buffy',
    title: 'The Enthusiastic Coding Assistant',
    description: 'Base agent that orchestrates the full response.',
  },
  gemini25flash_base: {
    name: 'Buffy',
    title: 'The Enthusiastic Coding Assistant',
    description: 'Base agent that orchestrates the full response.',
  },
  claude4_gemini_thinking: {
    name: 'Buffy',
    title: 'The Enthusiastic Coding Assistant',
    description: 'Base agent that orchestrates the full response.',
  },

  // Ask mode
  gemini25pro_ask: {
    name: 'Buffy',
    title: 'The Enthusiastic Coding Assistant',
    description: 'Base ask-mode agent that orchestrates the full response.',
  },

  // Specialized agents
  gemini25pro_thinker: {
    name: 'Theo',
    title: 'The Theorizer',
    description:
      'Does deep thinking given the current messages and a specific prompt to focus on. Use this to help you solve a specific problem.',
  },
  gemini25flash_file_picker: {
    name: 'Fletcher',
    title: 'The File Fetcher',
    description: 'Expert at finding relevant files in a codebase.',
  },
  gemini25flash_researcher: {
    name: 'Reid Searcher',
    title: 'The Researcher',
    description:
      'Expert at researching topics using web search and documentation.',
  },
  gemini25pro_planner: {
    name: 'Peter Plan',
    title: 'The Planner',
    description:
      'Agent that formulates a comprehensive plan to a prompt. Please prompt it with a few ideas and suggestions for the plan.',
  },
  gemini25flash_dry_run: {
    name: 'Sketch',
    title: 'The Dry Runner',
    description:
      'Agent that takes a plan and try to implement it in a dry run.',
  },
  gemini25pro_reviewer: {
    name: 'Nit Pick Nick',
    title: 'The Reviewer',
    description:
      'Reviews file changes and responds with critical feedback. Use this after making any significant change to the codebase.',
  },
} as const

// Agent names for client-side reference without exposing full agent templates
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
  new Set(Object.values(AGENT_PERSONAS).map((persona) => persona.name))
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
