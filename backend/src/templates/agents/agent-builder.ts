import type { Model } from '@codebuff/common/constants'
import type { ToolName } from '@codebuff/common/tools/constants'
import type { AgentTemplate } from '../types'

import * as fs from 'fs'
import * as path from 'path'

import {
  AGENT_TEMPLATES_DIR,
  openrouterModels,
  AGENT_CONFIG_FILE,
} from '@codebuff/common/constants'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import { compileToolDefinitions } from '@codebuff/common/tools/compile-tool-definitions'
import z from 'zod/v4'

const TEMPLATE_RELATIVE_PATH =
  `../../../../common/src/util/${AGENT_CONFIG_FILE}` as const

// Import to validate path exists at compile time
import(TEMPLATE_RELATIVE_PATH)

const TEMPLATE_PATH = path.join(__dirname, TEMPLATE_RELATIVE_PATH)
const DEFAULT_MODEL = openrouterModels.openrouter_claude_sonnet_4
const TEMPLATE_TYPES_PATH = path.join(AGENT_TEMPLATES_DIR, AGENT_CONFIG_FILE)
const TOOL_DEFINITIONS_FILE = 'tools.d.ts'
const TOOL_DEFINITIONS_PATH = path.join(
  AGENT_TEMPLATES_DIR,
  TOOL_DEFINITIONS_FILE
)

export const agentBuilder = (model: Model): Omit<AgentTemplate, 'id'> => {
  // Read the AGENT_CONFIG_FILE content dynamically
  // The import above ensures this path exists at compile time
  let agentTemplateContent = ''
  try {
    agentTemplateContent = fs.readFileSync(TEMPLATE_PATH, 'utf8')
  } catch (error) {
    console.warn(`Could not read ${AGENT_CONFIG_FILE}:`, error)
    agentTemplateContent = '// Agent template types not available'
  }

  return {
    displayName: 'Bob the Agent Builder',
    model,
    inputSchema: {
      prompt: z
        .string()
        .optional()
        .describe(
          'What agent type you would like to create or edit. Include as many details as possible.'
        ),
      params: z
        .object({
          editMode: z
            .boolean()
            .optional()
            .describe('Whether this is editing an existing agent'),
          agentId: z
            .string()
            .optional()
            .describe('ID of the agent being edited'),
          filePath: z
            .string()
            .optional()
            .describe('File path of the agent being edited'),
          originalContent: z
            .string()
            .optional()
            .describe('Original content of the agent file'),
          // Keep existing params as well
          name: z.string().optional(),
          purpose: z.string().optional(),
          specialty: z.string().optional(),
          model: z.string().optional(),
        })
        .passthrough()
        .optional(),
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
    subagents: [AgentTemplateTypes.file_picker],
    parentPrompt:
      'Creates new agent templates for the codebuff mult-agent system',
    systemPrompt: [
      '# Agent Builder',
      '',
      'You are an expert agent builder specialized in creating new agent templates for the codebuff system. You have comprehensive knowledge of the agent template architecture and can create well-structured, purpose-built agents.',
      '',
      '## Complete Agent Template Type Definitions',
      '',
      'Here are the complete TypeScript type definitions for creating custom Codebuff agents:',
      '',
      '```typescript',
      agentTemplateContent,
      '```',
      '',
      '## Agent Template Patterns:',
      '',
      '1. **Base Agent Pattern**: Full-featured agents with comprehensive tool access',
      '2. **Specialized Agent Pattern**: Focused agents with limited tool sets',
      '3. **Thinking Agent Pattern**: Agents that spawn thinker sub-agents',
      '4. **Research Agent Pattern**: Agents that start with web search',
      '',
      '## Best Practices:',
      '',
      '1. **Use as few fields as possible**: Leave out fields that are not needed to reduce complexity. Use as few fields as possible to accomplish the task.',
      '2. **Minimal Tools**: Only include tools the agent actually needs',
      '3. **Clear and Concise Prompts**: Write clear, specific prompts that have no unnecessary words',
      '4. **Consistent Naming**: Follow naming conventions (kebab-case for IDs)',
      '5. **Appropriate Model**: Choose the right model for the task complexity',
      '',
      '## Your Task:',
      'When asked to create an agent template, you should:',
      "1. Understand the requested agent's purpose and capabilities",
      "2. Choose appropriate tools for the agent's function",
      '3. Write a comprehensive system prompt',
      `4. Create the complete agent template file in ${AGENT_TEMPLATES_DIR}`,
      '5. Ensure the template follows all conventions and best practices',
      '6. Use the AgentConfig interface for the configuration',
      '',
      'Create agent templates that are focused, efficient, and well-documented. Always import the AgentConfig type and export a default configuration object.',
    ].join('\n'),
    instructionsPrompt: `You are helping to create or edit an agent template. The user will describe what kind of agent they want to create or how they want to modify an existing agent.

For new agents, analyze their request and create a complete agent template that:
- Has a clear purpose and appropriate capabilities
- Leaves out fields that are not needed.
- Uses only the tools it needs
- Follows naming conventions
- Is properly structured

For editing existing agents:
- First read the existing agent file they want to edit using read_files
- Understand the current structure and functionality
- Make the requested changes while preserving what works
- Maintain best practices and ensure the agent still works effectively
- Use str_replace for targeted edits or write_file for major restructuring

When editing, always start by reading the current agent file to understand its structure before making changes. Ask clarifying questions if needed, then create or update the template file in the appropriate location.

IMPORTANT: Always end your response with the end_turn tool when you have completed the agent creation or editing task.`,
    stepPrompt: '',

    // Generator function that defines the agent's execution flow
    handleSteps: function* ({ agentState, prompt, params }) {
      // Step 1: Create directory structure
      yield {
        toolName: 'run_terminal_command',
        args: {
          command: `mkdir -p ${AGENT_TEMPLATES_DIR}`,
          process_type: 'SYNC',
          timeout_seconds: 10,
        },
      }

      // Step 2: Write the AGENT_CONFIG_FILE with the template content
      yield {
        toolName: 'write_file',
        args: {
          path: TEMPLATE_TYPES_PATH,
          instructions: 'Create agent template type definitions file',
          content: agentTemplateContent,
        },
      }

      // Step 3: Write the tool definitions file
      const toolDefinitionsContent = compileToolDefinitions()
      yield {
        toolName: 'write_file',
        args: {
          path: TOOL_DEFINITIONS_PATH,
          instructions: 'Create tools type file',
          content: toolDefinitionsContent,
        },
      }

      // Step 4: Add user message with requirements for agent creation or editing
      const isEditMode = params?.editMode === true

      if (isEditMode) {
        // Edit mode - the prompt should already contain the edit request
        // No need to add additional message, the user prompt contains everything
      } else {
        // Creation mode - add structured requirements
        const requirements = {
          name: params?.name || 'Custom Agent',
          purpose:
            params?.purpose ||
            'A custom agent that helps with development tasks',
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
- Create the agent template file in ${AGENT_TEMPLATES_DIR}
- Use the AgentConfig interface
- Include appropriate tools based on the specialty
- Write a comprehensive system prompt
- Follow naming conventions and best practices
- Export a default configuration object

Please create the complete agent template now.`,
          },
        }
      }

      // Step 5: Complete agent creation process
      yield 'STEP_ALL'
    },
  }
}
