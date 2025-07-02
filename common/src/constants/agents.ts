// Agent names for client-side reference without exposing full agent templates
export const AGENT_NAMES = {
  // Base agents
  opus4_base: 'Buffy',
  claude4_base: 'Buffy',
  gemini25pro_base: 'Buffy',
  gemini25flash_base: 'Buffy',
  claude4_gemini_thinking: 'Buffy',

  // Ask mode
  gemini25pro_ask: 'Buffy',

  // Specialized agents
  gemini25pro_thinker: 'Theo',
  gemini25flash_file_picker: 'Fletcher',
  gemini25flash_researcher: 'Reid',
  gemini25pro_planner: 'Peter Plan',
  gemini25flash_dry_run: 'Sketch',
  gemini25pro_reviewer: 'Nit Pick Nick',
} as const

// Agent metadata keyed by AgentTemplateType for backend template usage
export const AGENT_METADATA = {
  // Base agents
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
    description: 'Expert at finding relevant files in  a codebase.',
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

export type AgentName = (typeof AGENT_NAMES)[keyof typeof AGENT_NAMES]

// Get unique agent names for UI display
export const UNIQUE_AGENT_NAMES = Array.from(
  new Set(Object.values(AGENT_NAMES))
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
