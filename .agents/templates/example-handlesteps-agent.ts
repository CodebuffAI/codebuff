import { DynamicAgentConfig } from '@codebuff/common/types/dynamic-agent-template'

export default {
  id: 'example-handlesteps-agent',
  version: '1.0.0',
  displayName: 'Example HandleSteps Agent',
  parentPrompt:
    'Demonstrates how to use handleSteps generator functions for programmatic agent control',
  model: 'claude-3-5-sonnet-20241022',
  outputMode: 'json',
  toolNames: ['spawn_agents', 'set_output', 'end_turn'],
  spawnableAgents: ['file_picker'],

  systemPrompt:
    'You are an example agent that demonstrates handleSteps functionality.',
  instructionsPrompt: 'User request: {prompt}',
  stepPrompt: 'Continue processing the request.',

  // Generator function that defines the agent's execution flow
  handleSteps: function* ({ agentState, prompt, params }) {
    // Step 1: Spawn a file picker to find relevant files
    const { toolResult: filePickerResult } = yield {
      toolName: 'spawn_agents',
      args: {
        agents: [
          {
            agent_type: 'file_picker',
            prompt: prompt || 'Find relevant files for the user request',
          },
        ],
      },
    }

    // Step 2: Process the results and extract file paths using regex
    let message = 'File picker completed'
    let files: string[] = []

    if (filePickerResult) {
      // Extract the actual response from the agent_report wrapper
      const resultText = filePickerResult.result || ''

      // Extract file paths from backticks in the text
      const filePathRegex = /`([^`]+\.[a-zA-Z0-9]+)`/g
      const matches: string[] = []
      let match

      while ((match = filePathRegex.exec(resultText)) !== null) {
        const filePath: string | undefined = match[1]
        if (filePath && !matches.includes(filePath)) {
          matches.push(filePath)
        }
      }

      if (matches.length > 0) {
        files = matches
        message = `Found ${files.length} file paths mentioned in response`
      } else {
        message = `File picker completed but no file paths found`
      }
    }

    // Step 3: Set the final output
    yield {
      toolName: 'set_output',
      args: {
        message,
        files,
        prompt: prompt || 'No prompt provided',
        params: params || {},
        agentId: agentState.agentId,
      },
    }
  },
} satisfies DynamicAgentConfig
