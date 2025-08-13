import { publisher } from './constants'

import type {
  AgentDefinition,
  AgentStepContext,
} from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'changes-reviewer',
  publisher,
  displayName: 'Changes Reviewer',
  model: 'x-ai/grok-4',

  includeMessageHistory: false,

  spawnerPrompt:
    'Spawn when you need to review code changes in the git diff or staged changes',

  toolNames: ['read_files', 'run_terminal_command', 'spawn_agents'],
  spawnableAgents: ['file-explorer'],

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'Please provide a short description of the changes you want to review',
    },
  },

  systemPrompt:
    'You are an expert software developer. Your job is to review code changes and provide helpful feedback.',

  instructionsPrompt: `
Use the following guidelines to review the changes and suggest improvements:
- Find ways to simplify the code
- Reuse existing code as much as possible instead of writing new code
- Preserve as much behavior as possible in the existing code
- Prefer changing as few lines of code as possible
- Look for opportunities to improve the code's readability
- Look for logical errors in the code
- Look for missed cases in the code
- Look for any other bugs
    `.trim(),

  handleSteps: function* ({ agentState, prompt, params }: AgentStepContext) {
    // Step 1: Get list of changed files from git diff
    const { toolResult: gitDiffResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command: 'git diff HEAD --name-only',
        process_type: 'SYNC',
        timeout_seconds: 30,
      },
    }

    // Step 2: Get untracked files from git status
    const { toolResult: gitStatusResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command: 'git status --porcelain',
        process_type: 'SYNC',
        timeout_seconds: 30,
      },
    }

    // Step 3: Run full git diff to see the actual changes
    yield {
      toolName: 'run_terminal_command',
      input: {
        command: 'git diff HEAD',
        process_type: 'SYNC',
        timeout_seconds: 30,
      },
    }

    // Step 4: Extract file paths from git diff and status output
    const gitDiffOutput = gitDiffResult || ''
    const changedFiles = gitDiffOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('??') && !line.includes('OSC'))

    const gitStatusOutput = gitStatusResult || ''
    const untrackedFiles = gitStatusOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('??'))
      .map((line) => line.substring(3).trim()) // Remove '?? ' prefix
      .filter((file) => file)

    const allFilesToRead = [...changedFiles, ...untrackedFiles].filter(
      (file) => file,
    )

    // Step 5: Read the files
    if (allFilesToRead.length > 0) {
      yield {
        toolName: 'read_files',
        input: {
          paths: allFilesToRead,
        },
      }
    }

    // Step 5: Put words in the AI's mouth to get it to spawn the file explorer.
    yield {
      toolName: 'add_message',
      input: {
        role: 'assistant',
        content:
          'Now I will spawn a file explorer to find any missing codebase context, and then review the changes.',
      },
    }

    yield 'STEP_ALL'
  },
}

export default definition
