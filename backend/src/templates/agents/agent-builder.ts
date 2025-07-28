import * as fs from 'fs'
import * as path from 'path'

import { Model, openrouterModels } from '@codebuff/common/constants'
import { ToolName } from '@codebuff/common/constants/tools'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import z from 'zod/v4'

import { AgentTemplate } from '../types'

const TEMPLATE_RELATIVE_PATH =
  '../../../../common/src/templates/agent-template.d.ts' as const

// Import to validate path exists at compile time
import(TEMPLATE_RELATIVE_PATH)

const TEMPLATE_PATH = path.join(__dirname, TEMPLATE_RELATIVE_PATH)
const DEFAULT_MODEL = openrouterModels.openrouter_claude_sonnet_4
const TEMPLATE_TYPES_PATH = '.agents/templates/agent-template.d.ts'

export const agentBuilder = (model: Model): Omit<AgentTemplate, 'id'> => {
  // Read the agent-template.d.ts file content dynamically
  // The import above ensures this path exists at compile time
  let agentTemplateContent = ''
  try {
    agentTemplateContent = fs.readFileSync(TEMPLATE_PATH, 'utf8')
  } catch (error) {
    console.warn('Could not read agent-template.d.ts:', error)
    agentTemplateContent = '// Agent template types not available'
  }

  return {
    name: 'Bob the Agent Builder',
    purpose: 'Creates new agent templates for the codebuff mult-agent system',
    model,
    promptSchema: {
      prompt: z
        .string()
        .optional()
        .describe(
          'What agent type you would like to create. Include as many details as possible.'
        ),
    },
    outputMode: 'json',
    includeMessageHistory: false,
    toolNames: [
      'write_file',
      'str_replace',
      'run_terminal_command',
      'read_files',
      'code_search',
      'spawn_agents',
      'add_message',
      'set_output',
      'end_turn',
    ] satisfies ToolName[],
    spawnableAgents: [AgentTemplateTypes.file_picker],
    systemPrompt: `# Agent Builder

You are an expert agent builder specialized in creating new agent templates for the codebuff system. You have comprehensive knowledge of the agent template architecture and can create well-structured, purpose-built agents.

## Complete Agent Template Type Definitions

Here are the complete TypeScript type definitions for creating custom Codebuff agents:

\`\`\`typescript
${agentTemplateContent}
\`\`\`

## Agent Template Patterns:

1. **Base Agent Pattern**: Full-featured agents with comprehensive tool access
2. **Specialized Agent Pattern**: Focused agents with limited tool sets
3. **Thinking Agent Pattern**: Agents that spawn thinker sub-agents
4. **Research Agent Pattern**: Agents that start with web search

## Best Practices:

1. **Purpose-Driven**: Each agent should have a clear, specific purpose
2. **Minimal Tools**: Only include tools the agent actually needs
3. **Clear Prompts**: Write clear, specific system prompts
4. **Consistent Naming**: Follow naming conventions (kebab-case for IDs)
5. **Appropriate Model**: Choose the right model for the task complexity

## Your Task:
When asked to create an agent template, you should:
1. Understand the requested agent's purpose and capabilities
2. Choose appropriate tools for the agent's function
3. Write a comprehensive system prompt
4. Create the complete agent template file in .agents/templates/
5. Ensure the template follows all conventions and best practices
6. Use the AgentConfig interface for the configuration

Create agent templates that are focused, efficient, and well-documented. Always import the AgentConfig type and export a default configuration object.`,
    userInputPrompt: `You are helping to create a new agent template. The user will describe what kind of agent they want to create.

Analyze their request and create a complete agent template that:
- Has a clear purpose and appropriate capabilities
- Uses only the tools it needs
- Has a well-written system prompt
- Follows naming conventions
- Is properly structured

Ask clarifying questions if needed, then create the template file in the appropriate location.`,
    agentStepPrompt: `Continue working on the agent template creation. Focus on:
- Understanding the requirements
- Creating a well-structured template
- Following best practices
- Ensuring the agent will work effectively for its intended purpose`,

    // Generator function that defines the agent's execution flow
    handleSteps: function* ({
      agentState,
      prompt,
      params,
    }: {
      agentState: any
      prompt: string | undefined
      params: Record<string, any> | undefined
    }) {
      // Step 1: Create directory structure
      yield {
        toolName: 'run_terminal_command',
        args: {
          command: 'mkdir -p .agents/templates',
          process_type: 'SYNC',
          timeout_seconds: 10,
        },
      }

      // Step 2: Write the agent-template.d.ts file with the template content
      yield {
        toolName: 'write_file',
        args: {
          path: TEMPLATE_TYPES_PATH,
          instructions: 'Create agent template type definitions file',
          content: agentTemplateContent,
        },
      }

      // Step 3: Add user message with all requirements for agent creation
      const requirements = {
        name: params?.name || 'Custom Agent',
        purpose:
          params?.purpose || 'A custom agent that helps with development tasks',
        specialty: params?.specialty || 'general development',
        model: params?.model || DEFAULT_MODEL,
      }
      yield {
        toolName: 'add_message',
        args: {
          role: 'user',
          content: `Create a new agent template with the following specifications:

**Agent Details:**
- Name: ${requirements.name}
- Purpose: ${requirements.purpose}
- Specialty: ${requirements.specialty}
- Model: ${requirements.model}
- Agent ID: ${requirements.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')}

**Requirements:**
- Create the agent template file in .agents/templates/
- Use the AgentConfig interface
- Include appropriate tools based on the specialty
- Write a comprehensive system prompt
- Follow naming conventions and best practices
- Export a default configuration object

Please create the complete agent template now.`,
        },
      }

      // Step 5: Complete agent creation process
      yield 'STEP_ALL'
    },
  }
}
