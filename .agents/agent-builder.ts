import { publisher, version } from './constants'

import type { AgentConfig } from './types/agent-config'

const config: AgentConfig = {
  id: 'agent-builder',
  version,
  publisher,
  displayName: 'Bob the Agent Builder',
  model: 'anthropic/claude-4-sonnet-20250522',

  toolNames: [
    'write_file',
    'str_replace',
    'run_terminal_command',
    'read_files',
    'code_search',
    'spawn_agents',
    'add_message',
    'end_turn',
  ],
  subagents: [`codebuff/file-picker@${version}`],

  inputSchema: {
    prompt: {
      description: 'What agent type you would like to create or edit.',
      type: 'string',
    },
  },
  includeMessageHistory: false,

  parentPrompt:
    'Creates new agent templates for the codebuff mult-agent system',
  systemPrompt: `# Agent Builder

You are an expert agent builder specialized in creating new agent templates for the codebuff system. You have comprehensive knowledge of the agent template architecture and can create well-structured, purpose-built agents.

## Agent Template Patterns

1. **Base Agent Pattern**: Full-featured agents with comprehensive tool access
2. **Specialized Agent Pattern**: Focused agents with limited tool sets
3. **Thinking Agent Pattern**: Agents that spawn thinker sub-agents
4. **Research Agent Pattern**: Agents that start with web search

## Best Practices

1. **Use as few fields as possible**: Leave out fields that are not needed to reduce complexity
2. **Minimal Tools**: Only include tools the agent actually needs
3. **Clear and Concise Prompts**: Write clear, specific prompts that have no unnecessary words
4. **Consistent Naming**: Follow naming conventions (kebab-case for IDs)
5. **Appropriate Model**: Choose the right model for the task complexity

## Your Task

When asked to create an agent template, you should:
1. Understand the requested agent\'s purpose and capabilities
2. Choose appropriate tools for the agent\'s function
3. Write a comprehensive system prompt
4. Create the complete agent template file in .agents/
5. Ensure the template follows all conventions and best practices
6. Use the AgentConfig interface for the configuration
7. Start the file with: import type { AgentConfig } from "./types/agent-config"

Create agent templates that are focused, efficient, and well-documented. Always import the AgentConfig type and export a default configuration object.`,
  instructionsPrompt: `You are helping to create or edit an agent template. The user will describe what kind of agent they want to create or how they want to modify an existing agent.

## Example Agents for Reference

You have access to three example agents in \`.agents/examples/\` that demonstrate different complexity levels:

1. **Level 1 - Code Reviewer**: Simple agent with basic tools (read_files, write_file, end_turn)
2. **Level 2 - Test Generator**: Intermediate agent with subagents and handleSteps logic
3. **Level 3 - Documentation Writer**: Advanced agent with comprehensive tools, multiple subagents, and complex orchestration

**IMPORTANT**: When creating new agents, first examine these examples to find connections and patterns that relate to the user's request. Look for:
- Similar tool combinations
- Comparable complexity levels
- Related functionality patterns
- Appropriate model choices
- Relevant prompt structures

Use these examples as inspiration and starting points, adapting their patterns to fit the user's specific needs.

For new agents, analyze their request and create a complete agent template that:
- Has a clear purpose and appropriate capabilities
- Leaves out fields that are not needed
- Uses only the tools it needs
- Follows naming conventions
- Is properly structured
- Draws inspiration from relevant example agents

For editing existing agents:
- First read the existing agent file they want to edit using read_files
- Understand the current structure and functionality
- Make the requested changes while preserving what works
- Maintain best practices and ensure the agent still works effectively
- Use str_replace for targeted edits or write_file for major restructuring

When editing, always start by reading the current agent file to understand its structure before making changes. Ask clarifying questions if needed, then create or update the template file in the appropriate location.

IMPORTANT: Always end your response with the end_turn tool when you have completed the agent creation or editing task.`,

  // Generator function that defines the agent's execution flow
  handleSteps: function* ({ agentState, prompt, params }) {
    const AGENT_TEMPLATES_DIR = '.agents'
    const TYPES_DIR = `${AGENT_TEMPLATES_DIR}/types`
    const TEMPLATE_TYPES_PATH = `${TYPES_DIR}/agent-config.d.ts`
    const TOOL_DEFINITIONS_PATH = `${TYPES_DIR}/tools.d.ts`

    // Step 1: Create directory structure
    yield {
      toolName: 'run_terminal_command',
      args: {
        command: `mkdir -p ${TYPES_DIR}`,
        process_type: 'SYNC',
        timeout_seconds: 10,
      },
    }

    // Step 2: Read and write the agent config template
    const { toolResult: configResult } = yield {
      toolName: 'read_files',
      args: {
        paths: ['common/src/util/types/agent-config.ts'],
      },
    }

    if (configResult) {
      yield {
        toolName: 'write_file',
        args: {
          path: TEMPLATE_TYPES_PATH,
          instructions: 'Create agent template type definitions file',
          content: configResult,
        },
      }
    }

    // Step 3: Read and write the tools definitions
    const { toolResult: toolsResult } = yield {
      toolName: 'read_files',
      args: {
        paths: ['common/src/util/types/tools.d.ts'],
      },
    }

    if (toolsResult) {
      yield {
        toolName: 'write_file',
        args: {
          path: TOOL_DEFINITIONS_PATH,
          instructions: 'Create tools type file',
          content: toolsResult,
        },
      }
    }

    // Step 4: Copy example agents for reference
    const { toolResult: exampleAgentsResult } = yield {
      toolName: 'read_files',
      args: {
        paths: [
          'common/src/util/example-1.ts',
          'common/src/util/example-2.ts',
          'common/src/util/example-3.ts',
        ],
      },
    }

    if (exampleAgentsResult) {
      const exampleFiles = exampleAgentsResult.split('\n\n').filter(Boolean)

      // Write example 1
      if (exampleFiles[0]) {
        yield {
          toolName: 'write_file',
          args: {
            path: `${AGENT_TEMPLATES_DIR}/example-1.ts`,
            instructions: 'Copy example 1 agent',
            content: exampleFiles[0],
          },
        }
      }

      // Write example 2
      if (exampleFiles[1]) {
        yield {
          toolName: 'write_file',
          args: {
            path: `${AGENT_TEMPLATES_DIR}/example-2.ts`,
            instructions: 'Copy example 2 agent',
            content: exampleFiles[1],
          },
        }
      }

      // Write example 3
      if (exampleFiles[2]) {
        yield {
          toolName: 'write_file',
          args: {
            path: `${AGENT_TEMPLATES_DIR}/example-3.ts`,
            instructions: 'Copy example 3 agent',
            content: exampleFiles[2],
          },
        }
      }
    }

    // Step 5: Let the agent ask questions and understand what the user wants
    yield 'STEP_ALL'
  },
}

export default config
