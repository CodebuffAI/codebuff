import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const editor: SecretAgentDefinition = {
  id: 'editor',
  publisher,
  model: 'anthropic/claude-4-sonnet-20250522',
  displayName: 'Code Editor',
  spawnerPrompt:
    'Expert code editor that reads files first, then implements changes with high precision. If you are spawning only one editor, you should set show_output to true unless otherwise stated.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The coding task to implement',
    },
    params: {
      type: 'object',
      properties: {
        maxContextLength: {
          type: 'number',
        },
      },
      required: [],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: [
    'read_files',
    'write_file',
    'str_replace',
    'run_terminal_command',
    'code_search',
    'spawn_agents',
    'end_turn',
  ],
  spawnableAgents: ['file-explorer'],

  systemPrompt: `You are an expert code editor with deep understanding of software engineering principles.

You are extremely skilled at:
- Reading and understanding existing codebases
- Making surgical code changes
- Following established patterns
- Ensuring code quality and correctness
- Never duplicating existing code and always reusing existing code when possible
- Making the minimal change necessary to implement the user request
`,

  instructionsPrompt: `Implement the requested coding changes with precision, especially following any plans that have been provided.

Workflow:
1. First, spawn a file explorer discover all the relevant files for implementing the plan.
2. Read all relevant files to understand the current state. You must read any file that could be relevant to the plan, especially files you need to modify, but also files that could show codebase patterns you could imitate. Try to read all the files in a single tool call. E.g. use read_files on 20 different files.
3. Implement the changes using str_replace or write_file.
4. End turn when complete.

Principles:
- Read before you write
- Make minimal changes
- Follow existing patterns
- Ensure correctness
- IMPORTANT: Make as few changes as possible to satisfy the user request!
- IMPORTANT: When you edit files, you must make all your edits in a single message. You should edit multiple files in a single response by calling str_replace or write_file multiple times before stopping. Try to make all your edits in a single response, even if you need to call the tool 20 times in a row.`,

  handleSteps: function* () {
    // 1. Run to completion
    const { agentState } = yield 'STEP_ALL'

    // 2. Collect all the edits
    const { messageHistory } = agentState
    const editToolResults: string[] = []
    for (const message of messageHistory) {
      if (
        message.role === 'user' &&
        message.content.includes('<tool_result>')
      ) {
        // Parse out tool results for write_file and str_replace
        const writeFileMatches = message.content.match(
          /<tool_result>\s*<tool>write_file<\/tool>\s*<result>([\s\S]*?)<\/result>\s*<\/tool_result>/g,
        )
        const strReplaceMatches = message.content.match(
          /<tool_result>\s*<tool>str_replace<\/tool>\s*<result>([\s\S]*?)<\/result>\s*<\/tool_result>/g,
        )

        // Extract inner <result> content from write_file matches
        if (writeFileMatches) {
          for (const match of writeFileMatches) {
            const resultMatch = match.match(/<result>([\s\S]*?)<\/result>/)
            if (resultMatch) {
              editToolResults.push(resultMatch[1])
            }
          }
        }

        // Extract inner <result> content from str_replace matches
        if (strReplaceMatches) {
          for (const match of strReplaceMatches) {
            const resultMatch = match.match(/<result>([\s\S]*?)<\/result>/)
            if (resultMatch) {
              editToolResults.push(resultMatch[1])
            }
          }
        }
      }
    }
    const lastAssistantMessage =
      messageHistory.findLast((message) => message.role === 'assistant')
        ?.content ?? ''

    yield {
      toolName: 'set_output',
      input: {
        message: lastAssistantMessage,
        edits: editToolResults,
      },
    }
  },
}

export default editor
