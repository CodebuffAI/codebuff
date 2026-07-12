import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

type SpecialistConfig = {
  id: string
  displayName: string
  purpose: string
  focus: string[]
  terminal?: boolean
  advisory?: boolean
  intelligence?: Array<'environment' | 'tests' | 'builds' | 'audit'>
}

export function createSpecialist(config: SpecialistConfig): SecretAgentDefinition {
  return {
    id: config.id,
    publisher,
    displayName: config.displayName,
    spawnerPrompt: config.purpose,
    inputSchema: {
      prompt: { type: 'string', description: 'The exact scoped question or review task.' },
      params: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Exact files in scope.',
          },
          snapshot_id: {
            type: 'string',
            description: 'Expected change-review snapshot fingerprint.',
          },
          command: {
            type: 'string',
            description: 'Optional bounded diagnostic command for terminal-enabled specialists.',
          },
        },
        required: [],
      },
    },
    outputMode: 'last_message',
    outputSchema: {
      type: 'object',
      properties: {
        schemaVersion: { type: 'number' },
        verdict: { type: 'string', enum: ['LOOKS_GOOD', 'NON_BLOCKING', 'BLOCKING'] },
        snapshotFingerprint: { type: 'string' },
        reviewedFiles: { type: 'array', items: { type: 'string' } },
        findings: { type: 'array', items: { type: 'string' } },
        recommendations: { type: 'array', items: { type: 'string' } },
        evidence: { type: 'array', items: { type: 'string' } },
      },
      required: [
        'schemaVersion',
        'verdict',
        'snapshotFingerprint',
        'reviewedFiles',
        'findings',
        'recommendations',
        'evidence',
      ],
    },
    includeMessageHistory: false,
    toolNames: [
      'read_files',
      'read_outline',
      'code_search',
      'inspect_workspace',
      'get_task',
      'get_change_review_bundle',
      ...(config.intelligence?.includes('environment')
        ? (['inspect_environment'] as const)
        : []),
      ...(config.intelligence?.includes('tests')
        ? (['get_affected_tests'] as const)
        : []),
      ...(config.intelligence?.includes('builds')
        ? (['get_build_targets'] as const)
        : []),
      ...(config.intelligence?.includes('audit')
        ? (['inspect_codebase_structure', 'inspect_feature_completeness'] as const)
        : []),
      ...(config.terminal ? (['run_terminal_command'] as const) : []),
    ],
    terminalPermissionProfile: config.terminal ? 'read-only' : undefined,
    spawnableAgents: [],
    systemPrompt: `You are the ${config.displayName} specialist. You make source-backed judgments within a narrow contract and never invent validation, approvals, or filesystem state.`,
    instructionsPrompt: [
      'Read the exact current sources and the snapshot-scoped review bundle before judging.',
      'Echo the supplied snapshot_id exactly. If it is absent or differs from the current bundle, return BLOCKING with a stale-snapshot finding.',
      config.advisory
        ? 'Your output is advisory design/coordination evidence; do not mutate files or external systems.'
        : 'Any material issue requiring a code or contract change is BLOCKING.',
      'Focus areas:',
      ...config.focus.map((item) => `- ${item}`),
      'Every finding must name concrete evidence and an actionable correction. Return the required structured output and do not modify files.',
    ].join('\n'),
  }
}
