import { GEMINI_3_5_FLASH_LITE_MODEL_ID } from '@codebuff/common/constants/gemini'

import { publisher } from './constants'

import type {
  AgentDefinition,
  AgentStepContext,
} from './types/agent-definition'

const basher: AgentDefinition = {
  id: 'basher',
  publisher,
  model: GEMINI_3_5_FLASH_LITE_MODEL_ID,
  displayName: 'Basher',
  spawnerPrompt:
    'Runs a single terminal command and returns its output. A lightweight shell command executor. Every basher spawn MUST include params: { command: "<shell>" }. Add what_to_summarize only when you expect long or noisy output (full test suites, builds, large logs) and want an LLM to pull out the relevant part; for ordinary commands leave it off and read the output yourself. Short output is returned raw either way.',

  inputSchema: {
    params: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The terminal command to run in bash shell. Don\'t forget this field!',
        },
        what_to_summarize: {
          type: 'string',
          description:
            'Optional. What information from the command output is desired -- be specific about what to look for or extract. Only worth setting when you expect long or noisy output (a full test suite, a build, a large log); omit it for ordinary commands and read the output yourself. Output that is already short is returned raw either way, so setting this never hides anything from you.',
        },
        timeout_seconds: {
          type: 'number',
          description:
            'How long to wait, in seconds. Default 30, which is right for almost everything — omit this unless the command genuinely runs longer. Budget for the command you are actually running; an over-long value just means the user waits that long when something hangs. Values above 600 (10 minutes) are clamped. Set to -1 to wait indefinitely, for genuinely open-ended commands only.',
        },
      },
      required: ['command'],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['run_terminal_command'],
  systemPrompt: `You are an expert at analyzing the output of a terminal command.

Your job is to:
1. Review the terminal command and its output
2. Analyze the output based on what the user requested
3. Provide a clear, concise description of the relevant information

When describing command output:
- Use excerpts from the actual output when possible (especially for errors, key values, or specific data)
- Focus on the information the user requested
- Be concise but thorough
- If the output is very long, summarize the key points rather than reproducing everything
- Don't include any follow up recommendations, suggestions, or offers to help`,
  instructionsPrompt: `The user has provided a command to run and specified what information they want from the output.

Run the command and then describe the relevant information from the output, following the user's instructions about what to focus on.

Do not use any tools! Only analyze the output of the command.`,
  handleSteps: function* ({ params }: AgentStepContext) {
    const command = params?.command as string | undefined
    if (!command) {
      // Using console.error because agents run in a sandboxed environment without access to structured logger
      console.error('Basher agent: missing required "command" parameter')
      yield {
        toolName: 'set_output',
        input: { output: 'Error: Missing required "command" parameter' },
      }
      return
    }

    const timeout_seconds = params?.timeout_seconds as number | undefined
    const what_to_summarize = params?.what_to_summarize as string | undefined

    // Run the command
    const { toolResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command,
        ...(timeout_seconds !== undefined && { timeout_seconds }),
      },
    }

    // Only object values are real command-output objects, not plain strings.
    const result = toolResult?.[0]
    const output =
      result?.type === 'json' && typeof result.value === 'object'
        ? result.value
        : ''

    if (!what_to_summarize) {
      // Return the raw command output without summarization
      yield {
        toolName: 'set_output',
        input: { output },
        includeToolCall: false,
      }
      return
    }

    // Short-circuit: summarizing output the parent could just read is pure
    // waste — it spends an LLM round-trip (and its latency, on the critical
    // path of every typecheck/test spawn) to compress almost nothing, and the
    // typical summary is ~150 tokens anyway. Below the cutoff we hand back the
    // raw output, which is strictly more information than a summary of it.
    // Inlined rather than imported: this generator is serialized with
    // toString() and re-evaluated standalone, so it cannot close over module
    // scope. ~2000 chars is roughly 500 tokens.
    const RAW_OUTPUT_PASSTHROUGH_CHARS = 2000
    if (output && typeof output === 'object') {
      const o = output as {
        stdout?: string
        stderr?: string
        message?: string
        stdoutOmittedForLength?: true
      }
      const rawChars =
        (o.stdout ?? '').length +
        (o.stderr ?? '').length +
        (o.message ?? '').length
      // Defensive: stdoutOmittedForLength marks a result whose stdout was
      // dropped wholesale (simplify-tool-results.ts, applied by
      // trimMessagesToFitTokenLimit during context compaction). A fresh result
      // straight from the tool shouldn't carry it, but if one ever does, its
      // stdout is gone rather than small — passing it through would hand the
      // parent nothing, so summarize instead.
      if (!o.stdoutOmittedForLength && rawChars <= RAW_OUTPUT_PASSTHROUGH_CHARS) {
        yield {
          toolName: 'set_output',
          input: { output },
          includeToolCall: false,
        }
        return
      }
    }

    // Let the model analyze and describe the output
    yield 'STEP'
  },
}

export default basher
