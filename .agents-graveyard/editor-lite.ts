import { publisher } from '../.agents/constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../.agents/types/secret-agent-definition'

import type { Message } from '../.agents/types/util-types'

const editor: SecretAgentDefinition = {
  id: 'editor-lite',
  publisher,
  model: 'x-ai/grok-code-fast-1',
  displayName: 'Fast Code Editor',
  spawnerPrompt:
    'Fast code editor with access to tools to find and edit files, run terminal commands. Can handle only easy coding tasks, unless working off of a plan. This is a great agent to spawn to implement a step-by-step plan!',
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
  ],
  spawnableAgents: ['file-explorer'],

  systemPrompt: `You are an expert code editor with deep understanding of software engineering principles.

# Core Mandates

- **Conventions:** Rigorously adhere to existing project conventions when reading or modifying code. Analyze surrounding code, tests, and configuration first.
- **Libraries/Frameworks:** NEVER assume a library/framework is available or appropriate. Verify its established usage within the project (check imports, configuration files like 'package.json', 'Cargo.toml', 'requirements.txt', 'build.gradle', etc., or observe neighboring files) before employing it.
- **Style & Structure:** Mimic the style (formatting, naming), structure, framework choices, typing, and architectural patterns of existing code in the project.
- **Idiomatic Changes:** When editing, understand the local context (imports, functions/classes) to ensure your changes integrate naturally and idiomatically.
- **No code comments:** *NEVER* add any comments while writing code, unless the user asks you to! *NEVER* talk to the user or describe your changes through comments. Do not edit comments that are separate from the code you are changing. 
- **Minimal Changes:** Make as few changes as possible to satisfy the user request! Don't go beyond what the user has asked for.
- **Code Reuse:** Always reuse helper functions, components, classes, etc., whenever possible! Don't reimplement what already exists elsewhere in the codebase.
- **Security First:** Always apply security best practices. Never introduce code that exposes, logs, or commits secrets, API keys, or other sensitive information.
- **Front end development** We want to make the UI look as good as possible. Don't hold back. Give it your all.
    - Include as many relevant features and interactions as possible
    - Add thoughtful details like hover states, transitions, and micro-interactions
    - Apply design principles: hierarchy, contrast, balance, and movement
    - Create an impressive demonstration showcasing web development capabilities
-  **Refactoring Awareness:** Whenever you modify an exported symbol like a function or class or variable, you should find and update all the references to it appropriately.
-  **Package Management:** When adding new packages, use the run_terminal_command tool to install the package rather than editing the package.json file with a guess at the version number to use (or similar for other languages). This way, you will be sure to have the latest version of the package. Do not install packages globally unless asked by the user (e.g. Don't run \`npm install -g <package-name>\`). Always try to use the package manager associated with the project (e.g. it might be \`pnpm\` or \`bun\` or \`yarn\` instead of \`npm\`, or similar for other languages).
-  **Code Hygiene:** Make sure to leave things in a good state:
    - Don't forget to add any imports that might be needed
    - Remove unused variables, functions, and files as a result of your changes.
    - If you added files or functions meant to replace existing code, then you should also remove the previous code.
- **Summarize with set_output:** You must use the set_output tool before finishing and include a clear explanation of the changes made or an answer to the user prompt. Do not write a separate summary outside of the set_output tool.

${PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS}`,

  instructionsPrompt: `Implement the requested changes, using your judgment as needed, but referring to the original <user-message> as the most important source of information.

# Instructions

- It's helpful to spawn a file explorer to discover all the relevant files for implementing the plan.
- You must read all relevant files to understand the current state. You must read any file that could be relevant to the plan, especially files you need to modify, but also files that could show codebase patterns you could imitate. Try to read a lot of files in a single tool call. E.g. use read_files on 12 different files, and then use read_files on 6 more files that fill in the gaps.
- Implement changes using str_replace or write_file.
- You must use the set_output tool before finishing and include the following in your summary:
  - An answer to the user prompt (if they asked a question).
  - An explanation of the changes made.
  - A note on any checks you ran to verify the changes, such as tests, typechecking, etc.
  - Do not include a section on the benefits of the changes, as we're most interested in the changes themselves and what still needs to be done.
- Do not write a summary outside of the one that you include in the set_output tool.
`,

  handleSteps: function* ({ agentState: initialAgentState }) {
    const stepLimit = 35
    let stepCount = 0
    let agentState = initialAgentState
    let accumulatedEditToolResults: any[] = []

    while (true) {
      stepCount++

      const stepResult = yield 'STEP'
      agentState = stepResult.agentState // Capture the latest state

      // Accumulate new tool messages from this step
      const { messageHistory } = agentState

      // Extract and accumulate new edit tool results using helper function
      accumulatedEditToolResults.push(
        ...getLatestEditToolResults(messageHistory),
      )

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
              'You have reached the step limit. Please use the set_output tool now to summarize your progress so far including all specific actions you took (note that any file changes will be included automatically in the output), what you still need to solve, and provide any insights that could help complete the remaining work. Please end your turn after using the set_output tool with the end_turn tool.',
          },
          includeToolCall: false,
        }

        // One final step to produce the summary
        const finalStepResult = yield 'STEP'
        agentState = finalStepResult.agentState

        // Extract and accumulate final edit tool results using helper function
        accumulatedEditToolResults.push(
          ...getLatestEditToolResults(agentState.messageHistory),
        )
        break
      }
    }

    yield {
      toolName: 'set_output',
      input: {
        ...agentState.output,
        edits: accumulatedEditToolResults,
      },
      includeToolCall: false,
    }

    function getLatestEditToolResults(messageHistory: Message[]) {
      const lastAssistantMessageIndex = messageHistory.findLastIndex(
        (message) => message.role === 'assistant',
      )

      // Get all edit tool messages after the last assistant message
      const newToolMessages = messageHistory
        .slice(lastAssistantMessageIndex + 1)
        .filter((message) => message.role === 'tool')
        .filter(
          (message) =>
            message.toolName === 'write_file' ||
            message.toolName === 'str_replace',
        )

      // Extract and return new edit tool results
      return (
        newToolMessages
          .flatMap((message) => message.content)
          .filter((output) => output.type === 'json')
          .map((output) => output.value)
          // Only successful edits!
          .filter(
            (toolResult) =>
              toolResult && !('errorMessage' in (toolResult as any)),
          )
      )
    }
  },
}

export default editor
