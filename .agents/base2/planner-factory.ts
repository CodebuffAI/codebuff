import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

import type { ModelName, ToolCall } from 'types/agent-definition'

export const plannerFactory = (
  model: ModelName,
): Omit<SecretAgentDefinition, 'id'> => ({
  publisher,

  model,
  displayName: 'Peter Plan',
  spawnerPrompt:
    'Creates comprehensive plans by exploring the codebase, doing research on the web, and thinking deeply. Is a codebase expert. You can also use it get a deep answer to any question. Use this agent for tasks that require thinking.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The task to plan for',
    },
  },
  outputMode: 'structured_output',
  includeMessageHistory: true,
  toolNames: ['spawn_agents', 'read_files', 'end_turn', 'set_output'],
  spawnableAgents: [
    'file-explorer',
    'web-researcher',
    'docs-researcher',
    'read-only-commander',
    'thinker-gpt-5-high',
  ],

  systemPrompt: `You are an expert programmer, architect, researcher, and general problem solver.
You spawn agents to help you gather information which will be used to create a plan.

${PLACEHOLDER.FILE_TREE_PROMPT}
${PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS}`,

  instructionsPrompt: `You are gathering information which will be used to create a plan.
  
- It's helpful to spawn a file-explorer and read-only-commander to find all the relevant parts of the codebase. In parallel as part of the same spawn_agents tool call, you may also spawn a web-researcher or docs-researcher to search the web or technical documentation for relevant information. Note: for the read-only-commander, be sure to ask it to list the file paths of the relevant files for this task as absolute paths (e.g. src/example.ts, packages/components/Example.js, etc.).
- Read all the file paths that are relevant using the read_files tool.
- Read more and more files to get any information that could possibly help you make the best plan. It's good to read 20+ files.
- After you are satisfied with the information you have gathered from these agents, use the set_output tool to describe the relevant information and insights you have. Then stop and use the end_turn tool. The plan will be created in a separate step. Do not spawn thinker-gpt-5-high in this step.`,

  handleSteps: function* ({ prompt }) {
    // Step 1: Gather information
    const { agentState } = yield 'STEP_ALL'

    // Step 2: Parse out all the file paths and read them.
    const messagesBlob =
      // Exclude the first two messages, which are system prompt + context
      agentState.messageHistory
        .slice(2)
        .map((message) =>
          message.role === 'tool'
            ? JSON.stringify(
                {
                  toolName: message.content.toolName,
                  toolCallId: message.content.toolCallId,
                  output: message.content.output,
                },
                null,
                2,
              )
            : typeof message.content === 'string'
              ? message.content
              : message.content
                  .map((content) =>
                    content.type === 'text' ? content.text : '',
                  )
                  .join('\n'),
        )
        .join('\n')

    const filePaths = parseFilePathsFromToolResult(messagesBlob)

    // First, check which files exist with includeToolCall: false
    const { toolResult: fileExistenceResult } = yield {
      toolName: 'read_files',
      input: {
        paths: filePaths,
      },
      includeToolCall: false,
    } satisfies ToolCall

    // Parse the results to find which files actually exist
    const existingFilePaths =
      parseExistingFilesFromReadResult(fileExistenceResult)

    // Now read the existing files for real
    yield {
      toolName: 'read_files',
      input: {
        paths: existingFilePaths,
      },
    } satisfies ToolCall

    // Step 3: Spawn deep-thinker to analyze approach
    const { toolResult: deepThinkerToolResult } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'thinker-gpt-5-high',
            prompt: `Create a clear implementation plan for the following task, with a focus on simplicity and making the minimal changes necessary for an awesome implementation. Prompt: ${prompt}`,
          },
        ],
      },
    }

    yield {
      toolName: 'set_output',
      input: {
        plan: deepThinkerToolResult,
      },
    }

    function parseFilePathsFromToolResult(content: string): string[] {
      const filePaths: string[] = []

      // Match file paths that look like valid paths (containing / and file extensions)
      const filePathRegex =
        /(?:^|\s|\*\s*)((?:[\w-]+\/)*[\w.-]+\.[a-zA-Z]{1,4})(?=\s|$|,|\.|:)/gm

      let match
      while ((match = filePathRegex.exec(content)) !== null) {
        const filePath = match[1]
        // Filter out obvious false positives and ensure reasonable path structure
        if (
          filePath &&
          !filePath.startsWith('http') &&
          !filePath.includes('@') &&
          filePath.length > 3 &&
          filePath.split('/').length <= 10
        ) {
          filePaths.push(filePath)
        }
      }

      // Also look for backtick-quoted file paths
      const backtickPathRegex = /`([^`]+\.[a-zA-Z]{1,4})`/g
      while ((match = backtickPathRegex.exec(content)) !== null) {
        const filePath = match[1]
        if (
          filePath &&
          !filePath.startsWith('http') &&
          !filePath.includes('@')
        ) {
          filePaths.push(filePath)
        }
      }

      // Remove duplicates and return
      return [...new Set(filePaths)]
    }

    function parseExistingFilesFromReadResult(toolResult: any): string[] {
      if (!Array.isArray(toolResult)) {
        return []
      }

      const existingPaths: string[] = []
      for (const result of toolResult) {
        if (result.type === 'json' && result.value) {
          // The read_files result should contain file data with path and content
          if (typeof result.value === 'object' && result.value !== null) {
            // Handle both array format and object format
            if (Array.isArray(result.value)) {
              for (const fileResult of result.value) {
                if (
                  fileResult.path &&
                  fileResult.content.trim() !== '[FILE_DOES_NOT_EXIST]'
                ) {
                  existingPaths.push(fileResult.path)
                }
              }
            } else if (
              result.value.path &&
              result.value.content.trim() !== '[FILE_DOES_NOT_EXIST]'
            ) {
              existingPaths.push(result.value.path)
            }
          }
        }
      }

      return existingPaths
    }
  },
})
