import { AGENT_TEMPLATES_DIR } from '@codebuff/common/old-constants'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import { green, gray, red } from 'picocolors'

import { enterMiniChat } from './mini-chat'
import { CLI } from '../cli'

interface AgentRequirements {
  name: string
  purpose: string
  specialty: string
  model: string
}

const AGENT_CREATION_STEPS = [
  {
    question:
      "Hi! I'll help you create a custom agent. What would you like to name your agent?",
    field: 'name',
    placeholder: 'e.g., "Code Reviewer", "API Helper", "Test Generator"',
  },
  {
    question:
      "Great! What's the main purpose of this agent? What should it help you with?",
    field: 'purpose',
    placeholder:
      'e.g., "Review code for best practices", "Help with API integration"',
  },
  {
    question: "What's this agent's specialty or domain expertise?",
    field: 'specialty',
    placeholder:
      'e.g., "React development", "Database optimization", "Security auditing"',
  },
  {
    question:
      'Which model should this agent use? (Press Enter for default: anthropic/claude-4-sonnet-20250522)',
    field: 'model',
    placeholder:
      'anthropic/claude-4-sonnet-20250522, gpt-4o, gemini-2.0-flash-exp',
    defaultValue: 'anthropic/claude-4-sonnet-20250522',
  },
]

export function startAgentCreationChat(
  rl: any,
  onExit: () => void,
  onComplete: (requirements: AgentRequirements) => void,
) {
  enterMiniChat(rl, onExit, {
    title: '🤖 Agent Creation Assistant',
    steps: AGENT_CREATION_STEPS,
    onComplete: async (responses) => {
      const requirements: AgentRequirements = {
        name: responses.name || 'My Custom Agent',
        purpose:
          responses.purpose ||
          'A custom agent that helps with development tasks',
        specialty: responses.specialty || 'general development',
        model: responses.model || 'anthropic/claude-4-sonnet-20250522',
      }

      try {
        await createAgentFromRequirements(requirements)
      } catch (error) {
        console.error(red('\nError creating agent:'))
        console.error(error instanceof Error ? error.message : String(error))
        onExit() // Only exit on error
      }
    },
  })
}

export async function createAgentFromRequirements(
  requirements: AgentRequirements,
) {
  // Create a simple prompt for the agent builder with the requirements
  const prompt = `Create a new agent template with these requirements:

Agent Name: ${requirements.name}
Purpose: ${requirements.purpose}
Specialty: ${requirements.specialty}
Model: ${requirements.model}

Please create a complete TypeScript agent template file in the ${AGENT_TEMPLATES_DIR} directory with proper types and a comprehensive system prompt.`

  try {
    // Use the resetAgent helper to properly switch to agent-builder which automatically spawns the agent builder
    const cliInstance = CLI.getInstance()
    await cliInstance.resetAgent(
      AgentTemplateTypes.agent_builder,
      {
        name: requirements.name,
        purpose: requirements.purpose,
        specialty: requirements.specialty,
        model: requirements.model,
      },
      prompt,
    )

    console.log(
      green(
        `\n✅ Agent created! Check the ${AGENT_TEMPLATES_DIR} directory for your new agent.`,
      ),
    )
    console.log(
      gray(
        'Continue adjusting your agent here, or type "/agents" to switch agents and test it out.',
      ),
    )

    cliInstance.freshPrompt()
  } catch (error) {
    console.error(red('\nError during agent creation:'))
    console.error(
      'Error message:',
      error instanceof Error ? error.message : String(error),
    )
    throw error
  }
}
