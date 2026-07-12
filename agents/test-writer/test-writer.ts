import { publisher } from '../constants'
import { PLACEHOLDER } from '../types/secret-agent-definition'

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
            'Optional list of source file paths the tests should cover. The parent must summarize their verified public contract in the prompt because the test-writer is runtime-scoped to test files.',
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
  filesystemScope: {
    read: [
      '**/*.test.*',
      '**/*.spec.*',
      '**/__tests__/**',
      '**/test/**',
      '**/tests/**',
    ],
    write: [
      '**/*.test.*',
      '**/*.spec.*',
      '**/__tests__/**',
      '**/test/**',
      '**/tests/**',
    ],
  },
  toolNames: [
    'read_files',
    'read_outline',
    'write_file',
    'str_replace',
  ],
  spawnableAgents: [],

  systemPrompt: `You are an expert test writer. You write clear, focused, idiomatic tests that follow the project's existing test conventions. You prefer behavior over implementation coupling. You do not run terminal commands directly; when validation is requested, report the command for the parent/basher to run.`,

  instructionsPrompt: `${PLACEHOLDER.LANGUAGE_PROFILE}

Instructions:
1. Work only in existing test locations (*.test.*, *.spec.*, __tests__/, test/, or tests/). The runtime enforces this filesystem scope. The parent must include the relevant source contract in the prompt; direct source reads are intentionally unavailable.
2. Read an existing in-scope test file in the same package to mimic its imports, harness, and assertion style. Do not invent a new test framework.
3. Write focused tests covering: the happy path, key edge cases (empty/null/zero/boundary), and the specific behavior the prompt asked for. Prefer one assertion concept per test.
4. Do not run terminal commands directly. If a test_command param is provided, include it as the validation command for the parent/basher to run after your changes.
5. Return a concise summary: which tests were added/modified, the file path, and validation status (parent/basher-owned, not run by test-writer, or skipped if no command was provided).
Do not refactor unrelated tests. Do not modify source code under test — if the source has a bug, report it and stop.`.trim(),

  handleSteps: function* () {
    yield 'STEP_ALL'
  },
}

export default definition
