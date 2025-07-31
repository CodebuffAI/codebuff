import { AgentConfig, AgentStepContext } from './types/agent-config'

const config: AgentConfig = {
  id: 'changes-reviewer',
  version: '0.0.1',
  displayName: 'Changes Reviewer',
  model: 'x-ai/grok-4',

  parentPrompt: 'Spawn when you need to review code changes',

  systemPrompt:
    'You are an expert software developer. Your job is to review code changes and provide helpful feedback.',

  instructionsPrompt: `
Use the following guidelines to review the changes and suggest improvements:
1. Find ways to simplify the code
2. Reuse existing code as much as possible instead of writing new code
3. Preserve as much behavior as possible in the existing code
4. Prefer to change as few lines of code as possible
5. Look for logical errors in the code
6. Look for missed cases in the code
7. Look for any other bugs
8. Look for opportunities to improve the code's readability
    `.trim(),

  includeMessageHistory: true,
  outputMode: 'last_message',

  toolNames: ['read_files', 'run_terminal_command', 'end_turn'],

  handleSteps: function* ({ agentState, prompt, params }: AgentStepContext) {
    // Step 1: Get list of changed files from git diff
    const { toolResult: gitDiffResult } = yield {
      toolName: 'run_terminal_command',
      args: {
        command: 'git diff HEAD --name-only',
        process_type: 'SYNC',
        timeout_seconds: 30,
      },
    }

    // Step 2: Get untracked files from git status
    const { toolResult: gitStatusResult } = yield {
      toolName: 'run_terminal_command',
      args: {
        command: 'git status --porcelain',
        process_type: 'SYNC',
        timeout_seconds: 30,
      },
    }

    // Step 3: Run full git diff to see the actual changes
    yield {
      toolName: 'run_terminal_command',
      args: {
        command: 'git diff HEAD',
        process_type: 'SYNC',
        timeout_seconds: 30,
      },
    }

    // Step 4: Extract file paths from git diff output
    const gitDiffOutput = gitDiffResult?.result || ''
    const changedFiles = gitDiffOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('??') && !line.includes('OSC'))

    // Step 5: Extract untracked files from git status output
    const gitStatusOutput = gitStatusResult?.result || ''
    const untrackedFiles = gitStatusOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('??'))
      .map((line) => line.substring(3).trim()) // Remove '?? ' prefix
      .filter((file) => file)

    // Step 6: Combine all files to read
    const allFilesToRead = [...changedFiles, ...untrackedFiles].filter(
      (file) => file,
    )

    if (allFilesToRead.length > 0) {
      yield {
        toolName: 'read_files',
        args: {
          paths: allFilesToRead,
        },
      }
    }

    // Step 7: Let AI review the changes
    yield 'STEP_ALL'
  },
}

export default config
