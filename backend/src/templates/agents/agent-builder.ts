import { Model } from '@codebuff/common/constants'
import { ToolName } from '@codebuff/common/constants/tools'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import z from 'zod/v4'
import { AgentTemplate } from '../types'
import * as fs from 'fs'
import * as path from 'path'

export const agentBuilder = (model: Model): Omit<AgentTemplate, 'id'> => {
  // Read the agent-template.d.ts file content dynamically
  let agentTemplateContent = ''
  try {
    const templatePath = path.join(
      __dirname,
      '../../../../common/src/templates/agent-template.d.ts'
    )
    agentTemplateContent = fs.readFileSync(templatePath, 'utf8')
  } catch (error) {
    console.warn('Could not read agent-template.d.ts:', error)
    agentTemplateContent = '// Agent template types not available'
  }

  return {
    name: 'Agent Builder',
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
      'read_files',
      'code_search',
      'spawn_agents',
      'set_output',
      'end_turn',
    ] satisfies ToolName[],
    spawnableAgents: [AgentTemplateTypes.file_picker],
    systemPrompt: `# Agent Builder - Template Creation Assistant

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
    handleSteps: function* ({ agentState, prompt, params }: {
      agentState: any;
      prompt: string | undefined;
      params: Record<string, any> | undefined;
    }) {
      // Parse the prompt to extract agent requirements
      const requirements = {
        name: params?.name || 'Custom Agent',
        purpose:
          params?.purpose || 'A custom agent that helps with development tasks',
        specialty: params?.specialty || 'general development',
        model: params?.model || 'anthropic/claude-4-sonnet-20250522',
      }

      // Step 1: Ensure .agents/templates directory exists
      yield {
        toolName: 'run_terminal_command',
        args: {
          command: 'mkdir -p .agents/templates',
          process_type: 'SYNC',
          timeout_seconds: 10,
          cb_easp: true,
        },
      }

      // Step 2: Copy agent-template.d.ts to .agents/templates/
      const templateTypesPath = '.agents/templates/agent-template.d.ts'
      const sourceTemplatePath = 'common/src/templates/agent-template.d.ts'

      yield {
        toolName: 'run_terminal_command',
        args: {
          command: `cat "${sourceTemplatePath}" > "${templateTypesPath}"`,
          process_type: 'SYNC',
          timeout_seconds: 10,
          cb_easp: true,
        },
      }

      // Step 3: Generate agent ID from name
      const agentId = requirements.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

      // Step 4: Determine appropriate tools based on specialty
      let tools = ['read_files', 'write_file', 'str_replace', 'end_turn']
      let spawnableAgents = []

      if (
        requirements.specialty.includes('research') ||
        requirements.specialty.includes('web')
      ) {
        tools.push('web_search', 'read_docs')
        spawnableAgents.push('researcher')
      }

      if (
        requirements.specialty.includes('code') ||
        requirements.specialty.includes('analysis')
      ) {
        tools.push('code_search', 'find_files')
        spawnableAgents.push('file_picker')
      }

      if (
        requirements.specialty.includes('terminal') ||
        requirements.specialty.includes('command')
      ) {
        tools.push('run_terminal_command')
      }

      if (
        requirements.specialty.includes('review') ||
        requirements.specialty.includes('quality')
      ) {
        spawnableAgents.push('reviewer')
      }

      // Step 5: Create the agent template content using AgentConfig interface
      const agentTemplate = `import { AgentConfig } from './agent-template'

export default {
  id: '${agentId}',
  name: '${requirements.name}',
  purpose: '${requirements.purpose}',
  model: '${requirements.model}',
  tools: ${JSON.stringify(tools, null, 2)},
  spawnableAgents: ${JSON.stringify(spawnableAgents, null, 2)},
  systemPrompt: \`# ${requirements.name}

You are a specialized agent focused on ${requirements.specialty}.

## Your Purpose
${requirements.purpose}

## Your Capabilities
- Expert knowledge in ${requirements.specialty}
- Access to relevant tools for your domain
- Ability to provide focused, high-quality assistance

## Guidelines
1. Stay focused on your specialty area
2. Provide clear, actionable advice
3. Use your tools effectively to gather information
4. Be thorough but concise in your responses
5. Ask clarifying questions when needed

Help users achieve their goals efficiently and effectively within your domain of expertise.\`,
} satisfies AgentConfig
`

      // Step 6: Write the agent template file
      const agentFilePath = `.agents/templates/${agentId}.ts`

      yield {
        toolName: 'write_file',
        args: {
          path: agentFilePath,
          instructions: `Create ${requirements.name} agent template`,
          content: agentTemplate,
        },
      }

      // Step 7: End the agent execution
      yield {
        toolName: 'end_turn',
        args: {
          cb_easp: true,
        },
      }
    },
  }
}
