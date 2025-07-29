import { AgentConfig, AgentStepContext } from './agent-config'

const config: AgentConfig = {
  id: 'git-committer',
  version: '0.0.1',
  displayName: 'Git Committer',
  model: 'anthropic/claude-4-sonnet-20250522',

  parentPrompt:
    'Spawn when you need to commit code changes to git with an appropriate commit message',

  systemPrompt:
    'You are an expert software developer. Your job is to create a git commit with a really good commit message.',

  instructionsPrompt:
    'Follow the steps to create a good commit: analyze changes with git diff and git log, read relevant files for context, stage appropriate files, analyze changes, and create a commit with proper formatting including the Codebuff footer.',

  stepPrompt:
    'Continue with the git commit process. Make sure to end your response by using set_output to output a structured summary of what you committed and whether it was successful.',

  inputSchema: {
    prompt: {
      type: 'string',
      description: 'What changes to commit',
    },
  },

  includeMessageHistory: false,
  outputMode: 'json',

  toolNames: [
    'read_files',
    'run_terminal_command',
    'set_output',
    'add_message',
    'end_turn',
  ],

  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      message: { type: 'string' },
      commitHash: { type: 'string' },
    },
    required: ['success', 'message'],
  },

  handleSteps: function* ({ agentState, prompt, params }: AgentStepContext) {
    // Step 1: Run git diff and git log to analyze changes
    yield {
      toolName: 'run_terminal_command',
      args: {
        command: 'git diff',
        process_type: 'SYNC',
        timeout_seconds: 30,
      },
    }

    yield {
      toolName: 'run_terminal_command',
      args: {
        command: 'git log --oneline -10',
        process_type: 'SYNC',
        timeout_seconds: 30,
      },
    }

    // Step 2: Let AI analyze the changes and read relevant files for context
    yield {
      toolName: 'add_message',
      args: {
        role: 'assistant',
        content:
          "I've analyzed the git diff and recent commit history. Now I'll read any relevant files to better understand the context of these changes.",
      },
    }

    // Step 3: Let AI decide which files to read and stage
    yield 'STEP'

    // Step 4: Let AI analyze staged changes and compose commit message
    yield {
      toolName: 'add_message',
      args: {
        role: 'assistant',
        content:
          "Now I'll analyze the staged changes and create a commit with the proper Codebuff footer format.",
      },
    }

    yield 'STEP_ALL'
  },
}

export default config
