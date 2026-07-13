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
  const family = config.advisory ? 'advisory' : 'reviewer'
  const dimensionKeys = config.focus.map((item) =>
    item
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, ''),
  )
  const findingSchema = {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string' as const,
        description: `Stable ID formatted as ${config.id}:<dimension>:<slug>.`,
      },
      severity: {
        type: 'string' as const,
        enum: ['critical', 'high', 'medium', 'low'],
      },
      dimension: { type: 'string' as const, enum: dimensionKeys },
      summary: { type: 'string' as const },
      evidence: { type: 'array' as const, items: { type: 'string' as const } },
      correction: { type: 'string' as const },
    },
    required: [
      'id',
      'severity',
      'dimension',
      'summary',
      'evidence',
      'correction',
    ],
  }
  const dimensionsSchema = {
    type: 'object' as const,
    properties: Object.fromEntries(
      dimensionKeys.map((dimension) => [
        dimension,
        {
          type: 'string' as const,
          enum: ['pass', 'warning', 'block', 'not_applicable'],
        },
      ]),
    ),
    required: dimensionKeys,
  }
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
        required: config.advisory ? [] : ['snapshot_id'],
      },
    },
    outputMode: 'structured_output',
    outputSchema: config.advisory
      ? {
          type: 'object',
          properties: {
            schemaVersion: { type: 'number' },
            family: { type: 'string', enum: ['advisory'] },
            snapshotFingerprint: { type: 'string' },
            reviewedFiles: { type: 'array', items: { type: 'string' } },
            dimensions: dimensionsSchema,
            findings: { type: 'array', items: findingSchema },
            recommendations: { type: 'array', items: { type: 'string' } },
            evidence: { type: 'array', items: { type: 'string' } },
          },
          required: [
            'schemaVersion',
            'family',
            'reviewedFiles',
            'dimensions',
            'findings',
            'recommendations',
            'evidence',
          ],
        }
      : {
          type: 'object',
          properties: {
            schemaVersion: { type: 'number' },
            family: { type: 'string', enum: ['reviewer'] },
            verdict: {
              type: 'string',
              enum: ['LOOKS_GOOD', 'NON_BLOCKING', 'BLOCKING'],
            },
            snapshotFingerprint: { type: 'string' },
            reviewedFiles: { type: 'array', items: { type: 'string' } },
            coverage: {
              type: 'string',
              enum: ['covered', 'missing', 'n/a'],
            },
            dimensions: dimensionsSchema,
            findings: { type: 'array', items: findingSchema },
            requirementCoverage: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  requirement: { type: 'string' },
                  status: {
                    type: 'string',
                    enum: ['satisfied', 'missing', 'uncertain'],
                  },
                  evidence: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
                required: ['requirement', 'status', 'evidence'],
              },
            },
          },
          required: [
            'schemaVersion',
            'family',
            'verdict',
            'snapshotFingerprint',
            'reviewedFiles',
            'coverage',
            'dimensions',
            'findings',
            'requirementCoverage',
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
      'set_output',
    ],
    terminalPermissionProfile: config.terminal ? 'read-only' : undefined,
    spawnableAgents: [],
    systemPrompt: `You are the ${config.displayName} specialist. You make source-backed judgments within a narrow contract and never invent validation, approvals, or filesystem state.`,
    instructionsPrompt: [
      config.advisory
        ? 'Read the exact current sources and task state. A snapshot_id is optional for pre-edit advisory work; when supplied, verify it against the current review bundle and echo it exactly.'
        : 'Read the exact current sources and snapshot-scoped review bundle. snapshot_id is required; echo it exactly and return BLOCKING with a stale-snapshot finding when it differs from the current bundle.',
      config.advisory
        ? 'Return family=advisory. Your output is design/coordination evidence; do not invent a blocking gate verdict and do not mutate files or external systems.'
        : 'Return family=reviewer. Any material issue requiring a code or contract change is BLOCKING.',
      'Focus areas:',
      ...config.focus.map((item) => `- ${item}`),
      `Use these exact dimension keys: ${dimensionKeys.join(', ')}. Every finding ID must be stable and formatted ${config.id}:<dimension>:<slug>; include severity, concrete evidence, and an actionable correction. Return the required structured output and do not modify files.`,
    ].join('\n'),
  }
}
