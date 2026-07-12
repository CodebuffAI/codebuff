import { publisher } from '../constants'

import type { ToolCall } from '../types/agent-definition'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'debugger',
  publisher,
  displayName: 'Dee',
  spawnerPrompt:
    'Root-causes a failing test, runtime error, or unexpected behavior by reading code + running targeted commands. Spawn when a validation failure needs diagnosis before a fix.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The failure to diagnose. Paste the exact error message, stack trace, or failing assertion, plus the command that produced it and the file/test it came from.',
    },
    params: {
      type: 'object',
      properties: {
        reproduce_command: {
          type: 'string',
          description:
            'The command that reproduces the failure (e.g. "bun test __tests__/foo.test.ts"). The agent will run it to confirm the failure before diagnosing.',
        },
        suspect_files: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of files most likely involved in the failure. The agent will read these first.',
        },
      },
      required: [],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: [
    'read_files',
    'read_outline',
    'code_search',
    'run_terminal_command',
    'git_status',
  ],
  spawnableAgents: [],

  systemPrompt: `You are an expert debugger. You form a minimal hypothesis, confirm it with evidence, and converge on the root cause. You never change code on a guess — you prove the cause first, then report the exact fix location.`,

  instructionsPrompt: `Instructions:
1. Reproduce: run the reproduce_command (if provided) to confirm the failure and capture the exact error. If the command passes, report "could not reproduce" and stop.
2. Localize: read the suspect_files and the stack trace's top project frame. Use code_search to find the caller chain, not just the throwing line.
3. Hypothesize: form ONE minimal hypothesis for the root cause. State it explicitly before confirming.
4. Confirm: run a targeted command or read a specific file that would distinguish your hypothesis from alternatives. Do not run more than 3 reproduce attempts.
5. Report:
   - Root cause: the exact file, line, and the incorrect logic/state.
   - Evidence: the command output or code excerpt that confirms it.
   - Fix: the precise change needed (file + what to change). Do NOT apply the fix — only describe it.
Return a concise root-cause report. Do not refactor or fix unrelated issues.`.trim(),

  handleSteps: function* ({ params }) {
    const reproduce = params?.reproduce_command as string | undefined
    if (typeof reproduce === 'string' && reproduce.trim().length > 0) {
      yield {
        toolName: 'run_terminal_command',
        input: { command: reproduce },
      } as ToolCall<'run_terminal_command'>
    }
    const suspectFiles = (params?.suspect_files as string[] | undefined) ?? []
    if (suspectFiles.length > 0) {
      yield {
        toolName: 'read_files',
        input: { paths: suspectFiles },
      } as ToolCall<'read_files'>
    }
    yield 'STEP_ALL'
  },
}

export default definition
