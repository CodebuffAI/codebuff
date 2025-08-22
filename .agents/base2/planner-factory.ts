import { ModelName, ToolCall } from 'types/agent-definition'
import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

export const plannerFactory = (
  model: ModelName,
): Omit<SecretAgentDefinition, 'id'> => ({
  publisher,

  model,
  displayName: 'Peter Plan',
  spawnerPrompt:
    'Creates comprehensive plans by exploring the codebase, doing research on the web, and thinking deeply. You can also use it to answer questions about anything you want to know.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The task to plan for',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['spawn_agents', 'end_turn'],
  spawnableAgents: ['file-explorer', 'researcher', 'gemini-thinker-high'],

  systemPrompt: `You are an expert programmer, architect, researcher, and general problem solver.
You spawn agents to help you gather information and think through the problems.

${PLACEHOLDER.FILE_TREE_PROMPT}
${PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS}`,

  instructionsPrompt: `Create a comprehensive plan for the given task.

Process:
- Spawn a file-explorer to understand the relevant codebase. You may also spawn a researcher to search the web for relevant information at the same time.
- After gathering information, spawn a thinker to analyze the best approach and craft a plan.`,

  handleSteps: function* ({ prompt }) {
    // Step 1: Spawn file-explorer and parse out the file paths
    const { agentState: stateAfterFileExplorer } = yield 'STEP'
    const { messageHistory } = stateAfterFileExplorer
    const lastAssistantMessageIndex =
      stateAfterFileExplorer.messageHistory.findLastIndex(
        (message) => message.role === 'assistant',
      )
    const toolResultMessage = messageHistory[lastAssistantMessageIndex + 1] ?? {
      content: '',
    }
    const filePaths = parseFilePathsFromToolResult(toolResultMessage.content)

    // Step 2: Read the files
    yield {
      toolName: 'read_files',
      input: {
        paths: filePaths,
      },
    } satisfies ToolCall

    // Step 3: Spawn deep-thinker to analyze approach
    const { toolResult: deepThinkerToolResult } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'gemini-thinker-high',
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
  },
})
