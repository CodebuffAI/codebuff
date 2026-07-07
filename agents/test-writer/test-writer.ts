import { publisher } from '../constants'

import type { ToolCall } from '../types/agent-definition'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'test-writer',
  publisher,
  displayName: 'Tess',
  spawnerPrompt:
    'Writes unit/integration tests for code changes and reports any requested validation command for the parent/basher to run. Spawn when you need new test coverage for a feature or bugfix, or to prepare validation of existing tests after edits.',
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
            'Optional test command for the parent/basher to run to validate the new tests pass (e.g. "bun test __tests__/foo.test.ts"). If omitted, the agent writes tests without requesting validation.',
        },
      },
      required: [],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['read_files', 'read_outline', 'code_search', 'write_file', 'str_replace'],
  spawnableAgents: [],

  systemPrompt: `You are an expert test writer. You write clear, focused, idiomatic tests that follow the project's existing test conventions. You prefer behavior over implementation coupling. You do not run terminal commands directly; when validation is requested, report the command for the parent/basher to run.`,

  instructionsPrompt: `Instructions:
1. Read the target source files (target_files param or referenced in the prompt) to understand the public surface and edge cases.
2. Find an existing test file in the same package to mimic its imports, harness, and assertion style. Do not invent a new test framework.
3. Write focused tests covering: the happy path, key edge cases (empty/null/zero/boundary), and the specific behavior the prompt asked for. Prefer one assertion concept per test.
4. Do not run terminal commands directly. If a test_command param is provided, include it as the validation command for the parent/basher to run after your changes.
5. Return a concise summary: which tests were added/modified, the file path, and validation status (parent/basher-owned, not run by test-writer, or skipped if no command was provided).
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
  },
}

export default definition
