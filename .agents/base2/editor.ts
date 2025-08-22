import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const editor: SecretAgentDefinition = {
  id: 'editor',
  publisher,
  model: 'anthropic/claude-4-sonnet-20250522',
  displayName: 'Code Editor',
  spawnerPrompt:
    'Expert code editor with access to tools to edit files and run terminal commands.',
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
  outputMode: 'structured_output',
  includeMessageHistory: true,
  toolNames: [
    'read_files',
    'write_file',
    'str_replace',
    'run_terminal_command',
    'code_search',
    'spawn_agents',
    'add_message',
    'set_output',
    'end_turn',
  ],
  spawnableAgents: ['file-explorer'],

  systemPrompt: `You are an expert code editor with deep understanding of software engineering principles.

You are extremely skilled at:
- Reading and understanding existing codebases
- Following existing codebase patterns
- Never duplicating existing code and always reusing existing code when possible
- Making the minimal change necessary to implement the user request
`,

  instructionsPrompt: `Implement the requested changes. Feel free to ignore the plan if it seems incorrect.

- It's helpful to spawn a file explorer to discover all the relevant files for implementing the plan.
- You must read all relevant files to understand the current state. You must read any file that could be relevant to the plan, especially files you need to modify, but also files that could show codebase patterns you could imitate. Try to read a lot of files in a single tool call. E.g. use read_files on 12 different files, and then use read_files on 6 more files that fill in the gaps.
- Implement changes using str_replace or write_file.
- End turn when complete.

Principles:
- Read before you write
- Follow existing patterns
- Ensure correctness
- Make as few changes as possible to satisfy the user request!

Other guidance:
- **Front end development** We want to make the UI look as good as possible. Don't hold back. Give it your all.
    - Include as many relevant features and interactions as possible
    - Add thoughtful details like hover states, transitions, and micro-interactions
    - Apply design principles: hierarchy, contrast, balance, and movement
    - Create an impressive demonstration showcasing web development capabilities
-  **Refactoring Awareness:** Whenever you modify an exported token like a function or class or variable, you should use the code_search tool to find all references to it before it was renamed (or had its type/parameters changed) and update the references appropriately.
-  **Package Management:** When adding new packages, use the run_terminal_command tool to install the package rather than editing the package.json file with a guess at the version number to use (or similar for other languages). This way, you will be sure to have the latest version of the package. Do not install packages globally unless asked by the user (e.g. Don't run \`npm install -g <package-name>\`). Always try to use the package manager associated with the project (e.g. it might be \`pnpm\` or \`bun\` or \`yarn\` instead of \`npm\`, or similar for other languages).
-  **Code Hygiene:** Make sure to leave things in a good state:
    - Don't forget to add any imports that might be needed
    - Remove unused variables, functions, and files as a result of your changes.
    - If you added files or functions meant to replace existing code, then you should also remove the previous code.
- **Edit multiple files at once:** When you edit files, you should make as many edits as possible in a single message. Call str_replace or write_file multiple times (e.g. 10 times) in a single message before stopping.
`,

  handleSteps: function* ({ agentState: initialAgentState }) {
    const stepLimit = 15
    let stepCount = 0
    let agentState = initialAgentState

    while (true) {
      stepCount++

      const stepResult = yield 'STEP'
      agentState = stepResult.agentState // Capture the latest state

      if (stepResult.stepsComplete) {
        break
      }

      // If we've reached within one of the step limit, ask LLM to summarize progress
      if (stepCount === stepLimit - 1) {
        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content:
              'You have reached the step limit. Please summarize your progress so far, what you still need to solve, and provide any insights that could help complete the remaining work. Please end your turn after producing this summary with the end_turn tool.',
          },
        }

        // One final step to produce the summary
        const finalStepResult = yield 'STEP'
        agentState = finalStepResult.agentState
        break
      }
    }

    // Collect all the edits from the conversation
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
