import type { AgentDefinition } from '@codebuff/sdk'

/**
 * Agent definition for testing the Freebuff CLI via tmux.
 *
 * This agent is designed to be used with the custom tmux tools from
 * `createFreebuffTmuxTools()`. It receives a testing task in its prompt
 * and uses tmux tools to start Freebuff, interact with it, and verify behavior.
 *
 * Example usage:
 * ```ts
 * const { tools, cleanup } = createFreebuffTmuxTools(binaryPath)
 * const result = await client.run({
 *   agent: freebuffTesterAgent.id,
 *   prompt: 'Start freebuff and verify the welcome screen shows Freebuff branding',
 *   agentDefinitions: [freebuffTesterAgent],
 *   customToolDefinitions: tools,
 *   handleEvent: collector.handleEvent,
 * })
 * await cleanup()
 * ```
 */
export const freebuffTesterAgent: AgentDefinition = {
  id: 'freebuff-tester',
  displayName: 'Freebuff E2E Tester',
  model: 'anthropic/claude-sonnet-4.5',
  toolNames: [
    'start_freebuff',
    'send_to_freebuff',
    'capture_freebuff_output',
    'stop_freebuff',
  ],
  instructionsPrompt: `You are a QA tester for the Freebuff CLI application.

Your job is to verify that Freebuff behaves correctly by interacting with it
through tmux tools. Follow these steps:

1. Call start_freebuff to launch the CLI
2. Use capture_freebuff_output (with waitSeconds) to see the terminal output
3. Use send_to_freebuff to type commands or text
4. Capture output again to verify behavior
5. ALWAYS call stop_freebuff when done

Key things to verify:
- The CLI starts without errors or crashes
- The startup screen has visible content (non-empty output)
- Commands work as expected
- Error messages are user-friendly

Report your findings clearly. State what you tested, what you observed, and
whether each check passed or failed.`,
}
