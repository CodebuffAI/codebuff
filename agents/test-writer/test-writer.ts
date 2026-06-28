import { publisher } from '../constants'

import type { ToolCall } from '../types/agent-definition'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'test-writer',
  publisher,
  displayName: 'Tess',
  spawnerPrompt:
    'Writes and runs unit/integration tests for code changes. Spawn when you need new test coverage for a feature or bugfix, or to validate that existing tests pass after edits.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'What to test and why. Include the feature/bug context, the files/functions under test, and the test framework + command to run (e.g. "bun test", "npm test", "pytest").',
    },
    params: {
      type: 'object',
      properties: {
        target_files: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of source file paths the tests should cover. The agent will read these before writing tests.',
        },
        test_command: {
          type: 'string',
          description:
            'Optional test command to run to validate the new tests pass (e.g. "bun test __tests__/foo.test.ts"). If omitted, the agent writes tests without running them.',
        },
      },
      required: [],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['read_files', 'read_outline', 'code_search', 'write_file', 'str_replace', 'run_terminal_command'],
  spawnableAgents: [],

  systemPrompt: `You are an expert test writer. You write clear, focused, idiomatic tests that follow the project's existing test conventions. You prefer behavior over implementation coupling. You run the tests when a command is provided and fix obvious failures before returning.`,

  instructionsPrompt: `Instructions:
1. Read the target source files (target_files param or referenced in the prompt) to understand the public surface and edge cases.
2. Find an existing test file in the same package to mimic its imports, harness, and assertion style. Do not invent a new test framework.
3. Write focused tests covering: the happy path, key edge cases (empty/null/zero/boundary), and the specific behavior the prompt asked for. Prefer one assertion concept per test.
4. If a test_command param is provided, run it with run_terminal_command. If it fails with a real assertion failure, fix the test or flag it; if it fails with an environment/infrastructure error, report the error verbatim and stop (do not keep retrying).
5. Return a concise summary: which tests were added/modified, the file path, and the test command result (pass/fail/skipped).
Do not refactor unrelated tests. Do not modify source code under test — if the source has a bug, report it and stop.`.trim(),

  handleSteps: function* ({ params }) {
    const targetFiles = (params?.target_files as string[] | undefined) ?? []
    if (targetFiles.length > 0) {
      yield {
        toolName: 'read_files',
        input: { paths: targetFiles },
      } as ToolCall<'read_files'>
    }
    yield 'STEP_ALL'
    const testCommand = params?.test_command as string | undefined
    if (typeof testCommand === 'string' && testCommand.trim().length > 0) {
      yield {
        toolName: 'run_terminal_command',
        input: { command: testCommand },
      } as ToolCall<'run_terminal_command'>
      yield 'STEP'
    }
  },
}

export default definition
