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
        retain_full_log: {
          type: 'boolean',
          description:
            'Keep the temporary full log after the result is produced. Defaults to false; set true only when the caller will inspect or preserve it.',
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
        cwd: {
          type: 'string',
          description: 'Optional project-relative working directory.',
        },
        detach: {
          type: 'boolean',
          description:
            'For BACKGROUND commands only, keep the job alive after request cancellation. Defaults to false.',
        },
      },
      required: ['command'],
    },
  },
  outputMode: 'structured_output',
  includeMessageHistory: false,
  toolNames: ['run_terminal_command'],
  programmaticToolNames: ['set_output'],
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

Run the command and then return the relevant command result information, following the user's instructions about what to focus on. If terminal policy denies the command, report that denial exactly and stop. Do not claim the user can approve and retry this basher invocation; use only the command surface allowed by the assigned terminal permission profile.

Do not use any tools! Only report the output of the command.`,
  handleSteps: function* ({ params }: AgentStepContext) {
    const command = params?.command as string | undefined
    if (!command) {
      // Using console.error because agents run in a sandboxed environment without access to structured logger
      console.error('Basher agent: missing required "command" parameter')
      yield {
        toolName: 'set_output',
        input: {
          data: { errorMessage: 'Missing required "command" parameter' },
        },
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
    const retain_full_log = params?.retain_full_log as boolean | undefined
    const cwd = params?.cwd as string | undefined
    const detach = params?.detach as boolean | undefined
    const shouldSaveFullLog =
      save_full_log === true && process_type !== 'BACKGROUND'
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
    const commandToRun = shouldSaveFullLog
      ? [
          'set -o pipefail',
          `(${command}) 2>&1 | tee ${shellQuote(fullLogPath!)} >/dev/null`,
          'status=${PIPESTATUS[0]}',
          ...(retain_full_log ? [`echo "full_log_path=${fullLogPath}"`] : []),
          'echo "exit_status=$status"',
          `grep -n -E ${shellQuote(failure_pattern)} ${shellQuote(
            fullLogPath!,
          )} | head -${failureLineLimit} || true`,
          ...(!retain_full_log ? [`rm -f ${shellQuote(fullLogPath!)}`] : []),
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
        ...(cwd !== undefined && { cwd }),
        ...(detach !== undefined && { detach }),
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

    const commandOutput =
      output && typeof output === 'object'
        ? (output as Record<string, unknown>)
        : {}
    const request = what_to_summarize.toLowerCase()
    const stopWords = new Set([
      'about',
      'extract',
      'from',
      'information',
      'list',
      'output',
      'show',
      'summarize',
      'summary',
      'that',
      'the',
      'what',
      'with',
    ])
    const focusWords = Array.from(
      new Set(request.match(/[a-z0-9_]{3,}/g) ?? []),
    ).filter((word) => !stopWords.has(word))
    const combinedOutput = [
      commandOutput.stdout,
      commandOutput.stderr,
      commandOutput.message,
      commandOutput.errorMessage,
    ]
      .filter((value): value is string => typeof value === 'string')
      .join('\n')
    const sourceLines = combinedOutput
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0)
    const wantsFailures =
      /\b(fail(?:ure|ures|ed)?|errors?|panic|broken)\b/.test(request)
    const wantsFiles = /\b(files?|paths?|directories|artifacts?)\b/.test(
      request,
    )
    const wantsStatus =
      /\b(status|results?|tests?|passes?|counts?|summary|startup|health)\b/.test(
        request,
      )
    const semanticPattern = wantsFailures
      ? /\b(?:fail(?:ure|ures|ed)?|error|panic|expected|received|not ok|exception|unhandled)\b/i
      : wantsStatus
        ? /\b(?:pass(?:ed|es)?|fail(?:ed|ures?)?|error|test(?:s|ed)?|ok|ready|running|started|stopped|total|success)\b/i
        : undefined
    const pathPattern =
      /^(?:[-*]\s+)?(?:\.?\.?\/)?[A-Za-z0-9_@.+-]+(?:\/[A-Za-z0-9_@.+() \[\]-]+)+(?:\.[A-Za-z0-9_-]+)?(?:\:\d+(?::\d+)?)?$/
    const selectedLines = sourceLines.filter((line) => {
      const lower = line.toLowerCase()
      if (focusWords.some((word) => lower.includes(word))) return true
      if (semanticPattern?.test(line)) return true
      if (wantsFiles && pathPattern.test(line.trim())) return true
      return false
    })
    const fallbackUsed = selectedLines.length === 0
    const extractedLines = (
      fallbackUsed ? sourceLines.slice(0, 12) : selectedLines
    )
      .slice(0, 80)
      .map((line) => (line.length > 1_000 ? `${line.slice(0, 1_000)}…` : line))
    const omittedLineCount = Math.max(
      0,
      sourceLines.length - extractedLines.length,
    )
    const exitCode =
      typeof commandOutput.exitCode === 'number'
        ? commandOutput.exitCode
        : undefined
    const backgroundStatus =
      typeof commandOutput.backgroundProcessStatus === 'string'
        ? commandOutput.backgroundProcessStatus
        : undefined
    const message = [
      `Command: ${command}`,
      `Requested summary: ${what_to_summarize}`,
      fullLogPath && retain_full_log
        ? `Full log retained: ${fullLogPath}`
        : fullLogPath
          ? 'Full log deleted after extracting relevant lines.'
          : undefined,
      commandOutput.startingCwd
        ? `Starting CWD: ${String(commandOutput.startingCwd)}`
        : undefined,
      exitCode === undefined ? undefined : `Exit code: ${exitCode}`,
      commandOutput.jobId
        ? `Job ID: ${String(commandOutput.jobId)}`
        : undefined,
      backgroundStatus ? `Background status: ${backgroundStatus}` : undefined,
      commandOutput.logFile
        ? `Log file: ${String(commandOutput.logFile)}`
        : undefined,
      extractedLines.length > 0
        ? `Extracted ${extractedLines.length} relevant line(s) for: ${what_to_summarize}`
        : `No output lines matched: ${what_to_summarize}`,
      ...extractedLines,
      omittedLineCount > 0
        ? `[omitted ${omittedLineCount} non-matching or excess line(s)]`
        : undefined,
    ]
      .filter((line): line is string => typeof line === 'string')
      .join('\n')

    yield {
      toolName: 'set_output',
      input: {
        data: {
          command,
          requestedSummary: what_to_summarize,
          message,
          extractedLines,
          omittedLineCount,
          fallbackUsed,
          ...(exitCode !== undefined && { exitCode }),
          ...(commandOutput.startingCwd
            ? { startingCwd: String(commandOutput.startingCwd) }
            : {}),
          ...(commandOutput.jobId
            ? { jobId: String(commandOutput.jobId) }
            : {}),
          ...(backgroundStatus
            ? { backgroundProcessStatus: backgroundStatus }
            : {}),
          ...(commandOutput.logFile
            ? { logFile: String(commandOutput.logFile) }
            : {}),
          ...(fullLogPath
            ? {
                fullLogRetained: retain_full_log === true,
                ...(retain_full_log === true ? { fullLogPath } : {}),
              }
            : {}),
        },
      },
      includeToolCall: false,
    } as ToolCall<'set_output'>
  },
}

export default basher
