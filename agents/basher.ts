import { publisher } from './constants'

import type {
  AgentDefinition,
  AgentStepContext,
  ToolCall,
} from './types/agent-definition'

const basher: AgentDefinition = {
  id: 'basher',
  publisher,
  displayName: 'Basher',
  spawnerPrompt:
    'Runs a single terminal command and returns a deterministic report of its output. Use what_to_summarize to label the information to extract. Every basher spawn MUST include params: { command: "<shell>" }.',

  inputSchema: {
    params: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description:
            "The terminal command to run in bash shell. Don't forget this field!",
        },
        what_to_summarize: {
          type: 'string',
          description:
            'What information from the command output is desired. Be specific about what to look for or extract. This is optional, and if not provided, the basher will return the full command output without summarization.',
        },
        save_full_log: {
          type: 'boolean',
          description:
            'For SYNC commands, save complete combined stdout/stderr to a /tmp log and return extracted failure lines in the summary output. Useful for broad test suites whose output may be truncated.',
        },
        failure_pattern: {
          type: 'string',
          description:
            'Optional grep -E pattern used with save_full_log to extract failure lines. Defaults to common test failure/error markers.',
        },
        max_failure_lines: {
          type: 'number',
          description:
            'Optional max number of extracted failure lines to return when save_full_log is true. Default 120.',
        },
        timeout_seconds: {
          type: 'number',
          description: 'Set to -1 for no timeout. Default 30',
        },
        process_type: {
          type: 'string',
          description:
            'SYNC (default, waits and returns output) or BACKGROUND (starts a detached job and returns a jobId immediately). Use BACKGROUND for long-running or never-exiting commands (dev servers, watchers, log tails); poll/follow the returned jobId with the check_job tool.',
        },
      },
      required: ['command'],
    },
  },
  outputMode: 'structured_output',
  includeMessageHistory: false,
  toolNames: ['run_terminal_command'],
  systemPrompt: `You are an expert at reading the output of a terminal command.

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

Run the command and then return the relevant command result information, following the user's instructions about what to focus on.

Do not use any tools! Only report the output of the command.`,
  handleSteps: function* ({ params }: AgentStepContext) {
    const command = params?.command as string | undefined
    if (!command) {
      // Using console.error because agents run in a sandboxed environment without access to structured logger
      console.error('Basher agent: missing required "command" parameter')
      yield {
        toolName: 'set_output',
        input: { data: { errorMessage: 'Missing required "command" parameter' } },
      } as ToolCall<'set_output'>
      return
    }

    const timeout_seconds = params?.timeout_seconds as number | undefined
    const what_to_summarize = params?.what_to_summarize as string | undefined
    const process_type = params?.process_type as
      | 'SYNC'
      | 'BACKGROUND'
      | undefined
    const save_full_log = params?.save_full_log as boolean | undefined
    const shouldSaveFullLog = save_full_log === true && process_type !== 'BACKGROUND'
    const failure_pattern =
      (params?.failure_pattern as string | undefined) ??
      '\\(fail\\)|error:|Expected|Received|panic|Unhandled|not ok'
    const max_failure_lines = params?.max_failure_lines as number | undefined
    const failureLineLimit = Math.max(1, Math.floor(max_failure_lines ?? 120))
    const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`
    // Use crypto.randomUUID() (Node global, no import needed) for the temp
    // log path. crypto.randomUUID is cryptographically random, unlike
    // Math.random(), so the filename is unpredictable and resists symlink /
    // collision attacks on /tmp. Kept inline because handleSteps is serialized.
    const fullLogPath = shouldSaveFullLog
      ? `/tmp/openbuff-basher-${crypto.randomUUID()}.log`
      : undefined
    const commandToRun =
      shouldSaveFullLog
        ? [
            'set -o pipefail',
            `(${command}) 2>&1 | tee ${shellQuote(fullLogPath!)} >/dev/null`,
            'status=${PIPESTATUS[0]}',
            `echo "full_log_path=${fullLogPath}"`,
            'echo "exit_status=$status"',
            `grep -n -E ${shellQuote(failure_pattern)} ${shellQuote(
              fullLogPath!,
            )} | head -${failureLineLimit} || true`,
            'exit "$status"',
          ].join('\n')
        : command

    // Run the command. Command reporting is deterministic: a successful shell
    // call must not be turned into a provider failure by a follow-up LLM step.
    const { toolResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command: commandToRun,
        ...(process_type !== undefined && { process_type }),
        ...(timeout_seconds !== undefined && { timeout_seconds }),
      },
      ...(what_to_summarize && { includeToolCall: false }),
    } as ToolCall<'run_terminal_command'>

    if (!what_to_summarize) {
      // Return the raw command output without summarization
      const result = toolResult?.[0]
      // Only return object values (command output objects), not plain strings
      const output =
        result?.type === 'json' && typeof result.value === 'object'
          ? result.value
          : { message: '' }
      yield {
        toolName: 'set_output',
        input: { data: output },
        includeToolCall: false,
      } as ToolCall<'set_output'>
      return
    }

    const result = toolResult?.[0]
    const output = result?.type === 'json' ? result.value : null

    const lines = [
      `Command: ${command}`,
      `Requested summary: ${what_to_summarize}`,
    ]
    if (fullLogPath) {
      lines.push(`Full log: ${fullLogPath}`)
      lines.push(`Failure pattern: ${failure_pattern}`)
      lines.push(`Max failure lines: ${failureLineLimit}`)
    }

    const appendBounded = (label: string, value: unknown, maxChars: number) => {
      if (value === undefined || value === null || value === '') return
      const text =
        typeof value === 'string' ? value : JSON.stringify(value, null, 2)
      if (!text) return
      lines.push('')
      lines.push(`${label}:`)
      lines.push(
        text.length > maxChars
          ? `${text.slice(0, maxChars)}\n[truncated ${text.length - maxChars} chars]`
          : text,
      )
    }

    if (output && typeof output === 'object') {
      const commandOutput = output as Record<string, unknown>
      if (commandOutput.startingCwd) {
        lines.push(`Starting CWD: ${String(commandOutput.startingCwd)}`)
      }
      if (commandOutput.exitCode !== undefined) {
        lines.push(`Exit code: ${String(commandOutput.exitCode)}`)
      }
      if (commandOutput.jobId)
        lines.push(`Job ID: ${String(commandOutput.jobId)}`)
      if (commandOutput.backgroundProcessStatus)
        lines.push(
          `Background status: ${String(commandOutput.backgroundProcessStatus)}`,
        )
      if (commandOutput.logFile)
        lines.push(`Log file: ${String(commandOutput.logFile)}`)
      if (commandOutput.status)
        lines.push(`Status: ${String(commandOutput.status)}`)
      appendBounded('Message', commandOutput.message, 2_000)
      appendBounded('Error', commandOutput.errorMessage, 2_000)
      appendBounded('stdout', commandOutput.stdout, 8_000)
      appendBounded('stderr', commandOutput.stderr, 4_000)
      appendBounded(
        'stdout omitted for length',
        commandOutput.stdoutOmittedForLength,
        1_000,
      )

      const hadStructuredOutput = [
        'message',
        'errorMessage',
        'stdout',
        'stderr',
        'stdoutOmittedForLength',
        'exitCode',
        'jobId',
        'backgroundProcessStatus',
        'logFile',
        'status',
      ].some((key) => commandOutput[key] !== undefined)
      if (!hadStructuredOutput)
        appendBounded('Command output JSON', output, 8_000)
    } else {
      appendBounded('Command output JSON', output, 8_000)
    }

    yield {
      toolName: 'set_output',
      input: {
        data: {
          message: lines.join('\n'),
        },
      },
      includeToolCall: false,
    } as ToolCall<'set_output'>
  },
}

export default basher
