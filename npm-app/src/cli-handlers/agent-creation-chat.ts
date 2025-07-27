import { enterMiniChat } from './mini-chat'
import * as fs from 'fs'
import * as path from 'path'
import { getProjectRoot } from '../project-files'
import { green, gray, yellow, red } from 'picocolors'
import { Client } from '../client'
import { CLI } from '../cli'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'

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
  onComplete: (requirements: AgentRequirements) => void
) {
  enterMiniChat(rl, onExit, {
    title: '🤖 Agent Creation Assistant',
    steps: AGENT_CREATION_STEPS,
    onComplete: (responses) => {
      const requirements: AgentRequirements = {
        name: responses.name || 'My Custom Agent',
        purpose:
          responses.purpose ||
          'A custom agent that helps with development tasks',
        specialty: responses.specialty || 'general development',
        model: responses.model || 'anthropic/claude-4-sonnet-20250522',
      }
      onComplete(requirements)
    },
  })
}

export async function createAgentFromRequirements(
  requirements: AgentRequirements
) {
  const agentsDir = path.join(getProjectRoot(), '.agents', 'templates')

  // Ensure directory exists
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true })
  }

  console.log(yellow('\nCreating agent with Agent Builder...'))

  // Read the source agent-template.d.ts file to provide full context
  const sourceTemplatePath = path.join(
    getProjectRoot(),
    'common',
    'src',
    'templates',
    'agent-template.d.ts'
  )

  let templateTypesContent: string
  try {
    templateTypesContent = fs.readFileSync(sourceTemplatePath, 'utf8')
  } catch (error) {
    console.error('Error reading template file:', error)
    throw new Error(`Failed to read agent template file: ${error}`)
  }

  // Create a detailed prompt for the agent builder with the requirements and full template context
  const agathaPrompt = `Create a new agent template with these requirements:

Agent Name: ${requirements.name}
Purpose: ${requirements.purpose}
Specialty: ${requirements.specialty}
Model: ${requirements.model}

Please:
1. Create the .agents/templates directory if it doesn't exist
2. Copy the agent-template.d.ts file to .agents/templates/agent-template.d.ts
3. Create a complete TypeScript agent template file in the .agents/templates directory

The agent should be well-structured and follow best practices.

IMPORTANT: When creating the agent file, make sure to import types from './agent-template' (without the .d.ts extension), not from './agent-template.d.ts'.

Here is the full agent-template.d.ts file for reference:\n\n\`\`\`typescript\n${templateTypesContent}\n\`\`\`

Please create the agent file with proper TypeScript types and a comprehensive system prompt that reflects the agent's specialty and purpose.`

  // Get the client instance and spawn agent-builder
  const client = Client.getInstance()

  try {
    // Use @Bob the Agent Builder syntax to directly invoke the agent-builder
    const agentBuilderPrompt = `@Bob the Agent Builder ${agathaPrompt}`

    // Send the prompt with agent reference
    const { responsePromise } = await client.sendUserInput(agentBuilderPrompt)

    // Wait for agent-builder to complete the agent creation
    await responsePromise

    console.log(green(`\nAgent creation completed by Bob the Agent Builder!`))
    console.log(
      gray('Check the .agents/templates directory for your new agent.')
    )
    console.log(gray('Restart Codebuff to use your new agent.'))
  } catch (error) {
    console.error(red('\nError during agent creation:'))
    console.error(
      'Error message:',
      error instanceof Error ? error.message : String(error)
    )
    throw error
  }
}
