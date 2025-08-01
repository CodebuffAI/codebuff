import type { AgentConfig } from './types/agent-config'

const config: AgentConfig = {
  id: 'sonnet4-agent-builder',
  displayName: 'Bob the Agent Builder',
  model: 'anthropic/claude-4-sonnet-20250522',
  inputSchema: {
    prompt: {
      description: 'What agent type you would like to create or edit.',
      type: 'string',
    },
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
  ],
  subagents: ['file-picker'],
  parentPrompt:
    'Creates new agent templates for the codebuff mult-agent system',
  systemPrompt:
    "# Agent Builder\n\nYou are an expert agent builder specialized in creating new agent templates for the codebuff system. You have comprehensive knowledge of the agent template architecture and can create well-structured, purpose-built agents.\n\n## Agent Template Patterns\n\n1. **Base Agent Pattern**: Full-featured agents with comprehensive tool access\n2. **Specialized Agent Pattern**: Focused agents with limited tool sets\n3. **Thinking Agent Pattern**: Agents that spawn thinker sub-agents\n4. **Research Agent Pattern**: Agents that start with web search\n\n## Best Practices\n\n1. **Use as few fields as possible**: Leave out fields that are not needed to reduce complexity\n2. **Minimal Tools**: Only include tools the agent actually needs\n3. **Clear and Concise Prompts**: Write clear, specific prompts that have no unnecessary words\n4. **Consistent Naming**: Follow naming conventions (kebab-case for IDs)\n5. **Appropriate Model**: Choose the right model for the task complexity\n\n## Your Task\n\nWhen asked to create an agent template, you should:\n1. Understand the requested agent's purpose and capabilities\n2. Choose appropriate tools for the agent's function\n3. Write a comprehensive system prompt\n4. Create the complete agent template file in .agents/\n5. Ensure the template follows all conventions and best practices\n6. Use the AgentConfig interface for the configuration\n7. Start the file with: import type { AgentConfig } from \"./types/agent-config\"\n\nCreate agent templates that are focused, efficient, and well-documented. Always import the AgentConfig type and export a default configuration object.",
  instructionsPrompt:
    'You are helping to create or edit an agent template. The user will describe what kind of agent they want to create or how they want to modify an existing agent.\n\n## Example Agents for Reference\n\nYou have access to three example agents in `.agents/examples/` that demonstrate different complexity levels:\n\n1. **Level 1 - Code Reviewer**: Simple agent with basic tools (read_files, write_file, set_output, end_turn)\n2. **Level 2 - Test Generator**: Intermediate agent with subagents and handleSteps logic\n3. **Level 3 - Documentation Writer**: Advanced agent with comprehensive tools, multiple subagents, and complex orchestration\n\n**IMPORTANT**: When creating new agents, first examine these examples to find connections and patterns that relate to the user\'s request. Look for:\n- Similar tool combinations\n- Comparable complexity levels\n- Related functionality patterns\n- Appropriate model choices\n- Relevant prompt structures\n\nUse these examples as inspiration and starting points, adapting their patterns to fit the user\'s specific needs.\n\nFor new agents, analyze their request and create a complete agent template that:\n- Has a clear purpose and appropriate capabilities\n- Leaves out fields that are not needed\n- Uses only the tools it needs\n- Follows naming conventions\n- Is properly structured\n- Draws inspiration from relevant example agents\n\nFor editing existing agents:\n- First read the existing agent file they want to edit using read_files\n- Understand the current structure and functionality\n- Make the requested changes while preserving what works\n- Maintain best practices and ensure the agent still works effectively\n- Use str_replace for targeted edits or write_file for major restructuring\n\nWhen editing, always start by reading the current agent file to understand its structure before making changes. Ask clarifying questions if needed, then create or update the template file in the appropriate location.\n\nIMPORTANT: Always end your response with the end_turn tool when you have completed the agent creation or editing task.',
  stepPrompt: '',

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

    if (configResult?.result) {
      yield {
        toolName: 'write_file',
        args: {
          path: TEMPLATE_TYPES_PATH,
          instructions: 'Create agent template type definitions file',
          content: configResult.result,
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

    if (toolsResult?.result) {
      yield {
        toolName: 'write_file',
        args: {
          path: TOOL_DEFINITIONS_PATH,
          instructions: 'Create tools type file',
          content: toolsResult.result,
        },
      }
    }

    // Step 4: Copy example agents for reference
    const { toolResult: exampleAgentsResult } = yield {
      toolName: 'read_files',
      args: {
        paths: [
          'common/src/util/example-agents/level-1-code-reviewer.ts',
          'common/src/util/example-agents/level-2-test-generator.ts',
          'common/src/util/example-agents/level-3-documentation-writer.ts'
        ],
      },
    }

    if (exampleAgentsResult?.result) {
      const exampleFiles = exampleAgentsResult.result.split('\n\n').filter(Boolean)
      
      // Write level 1 example
      if (exampleFiles[0]) {
        yield {
          toolName: 'write_file',
          args: {
            path: `${AGENT_TEMPLATES_DIR}/examples/level-1-code-reviewer.ts`,
            instructions: 'Copy level 1 example agent',
            content: exampleFiles[0],
          },
        }
      }
      
      // Write level 2 example
      if (exampleFiles[1]) {
        yield {
          toolName: 'write_file',
          args: {
            path: `${AGENT_TEMPLATES_DIR}/examples/level-2-test-generator.ts`,
            instructions: 'Copy level 2 example agent',
            content: exampleFiles[1],
          },
        }
      }
      
      // Write level 3 example
      if (exampleFiles[2]) {
        yield {
          toolName: 'write_file',
          args: {
            path: `${AGENT_TEMPLATES_DIR}/examples/level-3-documentation-writer.ts`,
            instructions: 'Copy level 3 example agent',
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
