import type {
  AgentDefinition,
  AgentStepContext,
} from '../types/agent-definition'

const config: AgentDefinition = {
  id: 'diff-reviewer-3',

  displayName: 'Diff Reviewer (Level 3)',
  model: 'openai/gpt-5',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'Please provide a short description of the changes you want to review',
    },
  },
  outputMode: 'last_message',

  toolNames: ['read_files', 'run_terminal_command', 'spawn_agents'],
  spawnableAgents: ['james/file-explorer@0.1.3'],

  parentPrompt: 'Spawn when you need to review code changes in the git diff',

  systemPrompt:
    'You are an expert software developer. Your job is to review code changes and provide helpful feedback.',

  instructionsPrompt: `Review the changes and suggest improvements.

Use the following guidelines while reviewing the changes:
- Find ways to simplify the code
- Reuse existing code as much as possible instead of writing new code
- Preserve as much behavior as possible in the existing code
- Prefer changing as few lines of code as possible
- Look for opportunities to improve the code's readability
- Look for logical errors in the code
- Look for missed cases in the code
- Look for any other bugs`,

  handleSteps: function* ({ agentState, prompt, params }: AgentStepContext) {
    // Step 1: Get list of changed files from git diff --name-only
    const { toolResult: gitDiffFilesResult } = yield {
      toolName: 'run_terminal_command',
      args: {
        command: 'git diff --name-only',
      },
    }

    // Then, extract file paths from the result
    const changedFiles = (gitDiffFilesResult || '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('??') && !line.includes('OSC'))

    // Step 2: Read the files
    if (changedFiles.length > 0) {
      yield {
        toolName: 'read_files',
        args: {
          paths: changedFiles,
        },
      }
    }

    // Step 3: Run full git diff to see the actual changes
    yield {
      toolName: 'run_terminal_command',
      args: {
        command: 'git diff',
      },
    }

    // Step 4: Put words in the AI's mouth to get it to spawn the file explorer.
    yield {
      toolName: 'add_message',
      args: {
        role: 'assistant',
        content:
          'Now I will spawn a file explorer to find any missing codebase context.',
      },
    }

    yield 'STEP'

    // Step 5: Put words in the AI's mouth to review the changes.
    yield {
      toolName: 'add_message',
      args: {
        role: 'assistant',
        content: 'Here is my comprehensive review of the changes.',
      },
    }

    // Step 6: Let AI review the changes in a final step. (The last message is also the agent's output.)
    yield 'STEP'
  },
}

export default config
