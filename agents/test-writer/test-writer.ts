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
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      schemaVersion: { type: 'number' },
      status: {
        type: 'string',
        enum: ['completed', 'partial', 'blocked'],
      },
      completionKind: {
        type: 'string',
        enum: ['changed', 'noop'],
      },
      changedFiles: { type: 'array', items: { type: 'string' } },
      evidence: { type: 'array', items: { type: 'string' } },
      requirementsAddressed: { type: 'array', items: { type: 'string' } },
      acceptanceCriteriaAddressed: {
        type: 'array',
        items: { type: 'string' },
      },
      unresolved: { type: 'array', items: { type: 'string' } },
      requestedValidation: { type: 'array', items: { type: 'string' } },
      summary: { type: 'string' },
    },
    required: [
      'schemaVersion',
      'status',
      'completionKind',
      'changedFiles',
      'evidence',
      'requirementsAddressed',
      'acceptanceCriteriaAddressed',
      'unresolved',
      'requestedValidation',
      'summary',
    ],
  },
  includeMessageHistory: false,
  filesystemScope: {
    read: [
      '**/*',
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
    'set_output',
  ],
  spawnableAgents: [],

  systemPrompt: `You are an expert test writer. You write clear, focused, idiomatic tests that follow the project's existing test conventions. You prefer behavior over implementation coupling. You do not run terminal commands directly; when validation is requested, report the command for the parent/basher to run.`,

  instructionsPrompt: `${PLACEHOLDER.LANGUAGE_PROFILE}

Instructions:
1. Write only in existing test locations (*.test.*, *.spec.*, __tests__/, test/, or tests/). You may read only the explicitly supplied target_files plus in-scope tests; do not browse unrelated source. The parent must include the relevant source contract and freshness evidence in the handoff.
2. Read an existing in-scope test file in the same package to mimic its imports, harness, and assertion style. Do not invent a new test framework.
3. Write focused tests covering: the happy path, key edge cases (empty/null/zero/boundary), and the specific behavior the prompt asked for. Prefer one assertion concept per test.
3a. For bug fixes, prefer writing the reproducing failing test before implementation when the orchestrator invokes you in pre-implementation mode.
4. Do not run terminal commands directly. If a test_command param is provided, include it as the validation command for the parent/basher to run after your changes.
5. Finish with set_output using the declared schema. Use completionKind=changed when files were modified. Use completionKind=noop only when existing tests already cover every requested behavior; then changedFiles must be empty and evidence must name the exact existing tests/assertions you read. Use status=completed only when every requested test deliverable is satisfied. List exact changedFiles, requirement/acceptance IDs addressed, unresolved items, and the parent-owned requestedValidation commands.
Do not refactor unrelated tests. Do not modify source code under test — if the source has a bug, report it and stop.`.trim(),

  handleSteps: function* () {
    yield 'STEP_ALL'
  },
}

export default definition
