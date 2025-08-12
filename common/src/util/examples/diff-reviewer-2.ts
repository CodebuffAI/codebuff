import type {
  AgentDefinition,
  AgentStepContext,
} from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'diff-reviewer-2',
  displayName: 'Diff Reviewer (Level 2)',
  model: 'openai/gpt-5',

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'Please provide a short description of the changes you want to review',
    },
  },
  toolNames: ['read_files', 'run_terminal_command'],

  parentPrompt: 'Spawn when you need to review code changes in the git diff',

  systemPrompt:
    'You are an expert software developer. Your job is to review code changes and provide helpful feedback.',

  instructionsPrompt: `Execute the following steps:
1. Run git diff
2. Read the files that have changed
3. Review the changes and suggest improvements

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
    // Step 1: Run git diff immediately. Saves the agent a step, lowering cost and latency!
    yield {
      toolName: 'run_terminal_command',
      args: {
        command: 'git diff',
      },
    }

    // Step 2: Let AI run the rest of the steps!
    yield 'STEP_ALL'
  },
}

export default definition
