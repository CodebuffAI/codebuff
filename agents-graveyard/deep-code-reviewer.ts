import { publisher } from '../.agents/constants'

import type { AgentDefinition } from '../.agents/types/agent-definition'

const definition: AgentDefinition = {
  id: 'deep-code-reviewer',
  publisher,
  displayName: 'Deep Code Reviewer',
  model: 'anthropic/claude-sonnet-4',

  includeMessageHistory: false,

  spawnerPrompt:
    'Spawn when you need to review code changes in the git diff or staged changes',

  toolNames: [
    'read_files',
    'code_search',
    'run_terminal_command',
    'spawn_agents',
  ],
  spawnableAgents: ['file-explorer', 'deep-thinker'],

  instructionsPrompt: `Instructions:
1. Use git diff to get the changes, but also get untracked files.
2. Read the files that have changed.
3. Spawn a file explorer to find all related and relevant files.
4. Read all the files that could be relevant to the changes.
5. Spawn 5 deep-thinker agents to review the changes from different perspectives.
6. Synthesize the insights from the deep-thinker agents into a single review.

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

  handleSteps: function* () {
    // Step 1: Get list of changed files from git diff
    const { toolResult: gitDiffResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command: 'git diff HEAD --name-only',
      },
    }

    // Step 2: Get untracked files from git status
    const { toolResult: gitStatusResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command: 'git status --porcelain',
      },
    }

    // Step 3: Run full git diff to see the actual changes
    yield {
      toolName: 'run_terminal_command',
      input: {
        command: 'git diff HEAD',
      },
    }

    // Step 4: Extract file paths from git diff and status output
    const gitDiffOutput = JSON.stringify(gitDiffResult ?? [])
    const changedFiles = gitDiffOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('??') && !line.includes('OSC'))

    const gitStatusOutput = JSON.stringify(gitStatusResult ?? [])
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

    yield 'STEP_ALL'
  },
}

export default definition
