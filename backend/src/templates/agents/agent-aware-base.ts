import * as fs from 'fs'
import * as path from 'path'

import {
  AGENT_TEMPLATES_DIR,
  openrouterModels,
  AGENT_CONFIG_FILE,
} from '@codebuff/common/constants'
import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import z from 'zod/v4'

import type { AgentTemplate } from '../types'
import type { Model } from '@codebuff/common/constants'
import type { ToolName } from '@codebuff/common/tools/constants'

const COMMON_UTIL_PATH = '../../../../common/src/util'
const TEMPLATE_RELATIVE_PATH =
  `${COMMON_UTIL_PATH}/types/${AGENT_CONFIG_FILE}` as const
// Import to validate path exists at compile time
import(TEMPLATE_RELATIVE_PATH)

const TEMPLATE_PATH = path.join(__dirname, TEMPLATE_RELATIVE_PATH)
const DEFAULT_MODEL = openrouterModels.openrouter_claude_sonnet_4
const TYPES_DIR = path.join(AGENT_TEMPLATES_DIR, 'types')
const TEMPLATE_TYPES_PATH = path.join(TYPES_DIR, AGENT_CONFIG_FILE)
const TOOL_DEFINITIONS_FILE = 'tools.d.ts'
const TOOL_DEFINITIONS_PATH = path.join(TYPES_DIR, TOOL_DEFINITIONS_FILE)

export const agentAwareBase = (
  model: Model,
  allAvailableAgents?: string[],
): Omit<AgentTemplate, 'id'> => {
  // Read the AGENT_CONFIG_FILE content dynamically
  // The import above ensures this path exists at compile time
  let agentTemplateContent = ''
  try {
    agentTemplateContent = fs.readFileSync(TEMPLATE_PATH, 'utf8')
  } catch (error) {
    console.warn(`Could not read ${AGENT_CONFIG_FILE}:`, error)
    agentTemplateContent = '// Agent template types not available'
  }
  // Read the tools.d.ts content from common package
  let toolDefinitionsContent = ''
  try {
    const toolsPath = path.join(
      __dirname,
      `${COMMON_UTIL_PATH}/types/tools.d.ts`,
    )
    toolDefinitionsContent = fs.readFileSync(toolsPath, 'utf8')
  } catch (error) {
    console.warn(`Could not read tools.d.ts from common:`, error)
    toolDefinitionsContent = '// Tool definitions not available'
  }

  // Read example agent files from common package
  const exampleAgentContents: Record<string, string> = {}

  try {
    const exampleAgentsDir = path.join(__dirname, `${COMMON_UTIL_PATH}`)
    // Check if directory exists before trying to read it
    if (fs.existsSync(exampleAgentsDir)) {
      const files = fs.readdirSync(exampleAgentsDir)

      files
        .filter((file) => file.endsWith('.ts') && file.startsWith('example-'))
        .forEach((filename) => {
          try {
            const fullPath = path.join(exampleAgentsDir, filename)
            const content = fs.readFileSync(fullPath, 'utf8')
            exampleAgentContents[filename] = content
          } catch (error) {
            console.warn(`Could not read example agent ${filename}:`, error)
          }
        })
    } else {
      console.warn(
        `Example agents directory does not exist: ${exampleAgentsDir}`,
      )
    }
  } catch (error) {
    console.warn('Could not read example agents directory:', error)
  }

  return {
    model,
    displayName: 'Buffy the Enthusiastic Agent Builder',
    parentPrompt:
      'Enhanced base agent that can create custom agents and handle all coding tasks with deterministic agent creation behavior',
    inputSchema: {
      prompt: z
        .string()
        .optional()
        .describe(
          'What agent type you would like to create or edit. Include as many details as possible.',
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
      'create_plan',
      'run_terminal_command',
      'set_output',
      'str_replace',
      'write_file',
      'spawn_agents',
      'add_subgoal',
      'browser_logs',
      'code_search',
      'end_turn',
      'read_files',
      'think_deeply',
      'update_subgoal',
      'add_message',
    ] satisfies ToolName[],
    subagents: allAvailableAgents
      ? (allAvailableAgents as any[])
      : [
          AgentTemplateTypes.file_picker,
          AgentTemplateTypes.researcher,
          AgentTemplateTypes.thinker,
          AgentTemplateTypes.reviewer,
          AgentTemplateTypes.agent_builder,
        ],

    systemPrompt: [
      '# Buffy the Enthusiastic Agent Builder',
      '',
      'You are an expert agent builder specialized in creating new agent templates for the codebuff system. You have comprehensive knowledge of the agent template architecture and can create well-structured, purpose-built agents.',
      '',
      '## Environment Setup Complete',
      '',
      'Your environment has been automatically prepared with:',
      '- Agent template type definitions in `.agents/types/agent-config.d.ts`',
      '- Tool type definitions in `.agents/types/tools.d.ts`',
      '- Example agent files copied to `.agents/` directory for reference',
      '',
      'All necessary files are now available in your working directory.',
      '',
      '## Complete Agent Template Type Definitions',
      '',
      'Here are the complete TypeScript type definitions for creating custom Codebuff agents:',
      '```typescript',
      agentTemplateContent,
      '```',
      '',
      '## Available Tools Type Definitions',
      '',
      'Here are the complete TypeScript type definitions for all available tools:',
      '',
      '```typescript',
      toolDefinitionsContent,
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
      '1. **Use as few fields as possible**: Leave out fields that are not needed to reduce complexity',
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
      '7. Start the file with: import type { AgentConfig } from "./types/agent-config"',
      '',
      'Create agent templates that are focused, efficient, and well-documented. Always import the AgentConfig type and export a default configuration object.',
    ].join('\n'),
    instructionsPrompt: `You are helping to create or edit an agent template. The user will describe what kind of agent they want to create or how they want to modify an existing agent.

## Environment Ready

Your environment has been automatically set up with:
- Type definitions in \`.agents/types/\`
- Example agent files in \`.agents/\` directory
- All necessary scaffolding complete

You can now proceed directly to agent creation or editing.

## Example Agents Available

Three example agents are now available in your \`.agents/\` directory:

1. **example-1.ts**: Simple agent with basic tools (read_files, write_file, set_output, end_turn)
2. **example-2.ts**: Intermediate agent with subagents and handleSteps logic
3. **example-3.ts**: Advanced agent with comprehensive tools, multiple subagents, and complex orchestration

**IMPORTANT**: Examine these examples to find connections and patterns that relate to the user's request. Look for:
- Similar tool combinations
- Comparable complexity levels
- Related functionality patterns
- Appropriate model choices
- Relevant prompt structures

Use these examples as inspiration and starting points, adapting their patterns to fit the user's specific needs.

## For New Agents

Analyze their request and create a complete agent template that:
- Has a clear purpose and appropriate capabilities
- Leaves out fields that are not needed
- Uses only the tools it needs
- Follows naming conventions
- Is properly structured
- Draws inspiration from relevant example agents

## For Editing Existing Agents

- First read the existing agent file they want to edit using read_files
- Understand the current structure and functionality
- Make the requested changes while preserving what works
- Maintain best practices and ensure the agent still works effectively
- Use str_replace for targeted edits or write_file for major restructuring

When editing, always start by reading the current agent file to understand its structure before making changes. Ask clarifying questions if needed, then create or update the template file in the appropriate location.

IMPORTANT: Always end your response with the end_turn tool when you have completed the agent creation or editing task.`,
    stepPrompt: '',

    handleSteps: function* ({ agentState, prompt, params }) {
      // Step 1: Create directory structure
      yield {
        toolName: 'run_terminal_command',
        args: {
          command: `mkdir -p ${TYPES_DIR}`,
          process_type: 'SYNC',
          timeout_seconds: 10,
          cb_easp: false,
        },
      }

      // Step 2: Write the AGENT_CONFIG_FILE with the template content
      yield {
        toolName: 'write_file',
        args: {
          path: TEMPLATE_TYPES_PATH,
          instructions: 'Create agent template type definitions file',
          content: agentTemplateContent,
          cb_easp: false,
        },
      }

      // Step 3: Write the tool definitions file (copy from existing tools.d.ts)
      yield {
        toolName: 'write_file',
        args: {
          path: TOOL_DEFINITIONS_PATH,
          instructions: 'Create tools type file',
          content: toolDefinitionsContent,
          cb_easp: false,
        },
      }

      // Step 4: Add message about reading example files and then read them
      yield {
        toolName: 'add_message',
        args: {
          role: 'assistant',
          content:
            "I'll read the example agent files to understand the patterns and then help you create your agent.",
          cb_easp: false,
        },
      }

      // Step 5: Copy example agent files to .agents/ directory
      for (const [filename, content] of Object.entries(exampleAgentContents)) {
        if (content) {
          yield {
            toolName: 'write_file',
            args: {
              path: `${AGENT_TEMPLATES_DIR}${filename}`,
              instructions: `Copy example agent file ${filename}`,
              content: content,
              cb_easp: false,
            },
          }
        }
      }

      // Step 6: Complete agent creation process
      yield 'STEP_ALL'
    },
  }
}
