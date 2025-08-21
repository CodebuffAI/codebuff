import { ToolCall } from 'types/agent-definition'
import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

const planner: SecretAgentDefinition = {
  id: 'planner',
  publisher,

  model: 'google/gemini-2.5-pro',
  displayName: 'Peter Plan',
  spawnerPrompt:
    'Creates comprehensive plans by exploring the codebase and deep thinking',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The coding task to plan for',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['spawn_agents', 'end_turn'],
  spawnableAgents: ['file-explorer', 'researcher', 'gemini-thinker-high'],

  systemPrompt: `You are a strategic planner who creates comprehensive plans for coding tasks.
You should spawn agents to help you gather information and think through the problem before creating your plan.
${PLACEHOLDER.FILE_TREE_PROMPT}
${PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS}`,

  instructionsPrompt: `Create a comprehensive plan for the given coding task.

Process:
1. First, spawn a file-explorer to understand the relevant codebase. You may also spawn a researcher to search the web for relevant information at the same time.
2. Then spawn a thinker to analyze the best approach
3. Finally, write out a plan that focuses on the high level approach to the task, with short excerpts of code/types that help

Your plan should be specific, actionable, and account for the current codebase structure.`,

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
}

export default planner
