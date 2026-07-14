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

const MAX_REVIEWED_FILES = 200
const MAX_FINDINGS = 20
const MAX_REQUIREMENTS = 100
const MAX_EVIDENCE_ITEMS = 8
const MAX_PATH_LENGTH = 1_000
const MAX_TEXT_LENGTH = 2_000

const boundedString = (maxLength = MAX_TEXT_LENGTH) => ({
  type: 'string' as const,
  maxLength,
})

const boundedStringArray = (maxItems = MAX_EVIDENCE_ITEMS) => ({
  type: 'array' as const,
  maxItems,
  items: boundedString(),
})

export function createSpecialist(
  config: SpecialistConfig,
): SecretAgentDefinition {
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
        ...boundedString(240),
        description: `Stable ID formatted as ${config.id}:<dimension>:<slug>.`,
      },
      severity: {
        type: 'string' as const,
        enum: ['critical', 'high', 'medium', 'low'],
      },
      dimension: { type: 'string' as const, enum: dimensionKeys },
      summary: boundedString(),
      evidence: boundedStringArray(),
      correction: boundedString(),
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
    spawnerPrompt: config.advisory
      ? config.purpose
      : `${config.purpose} Requires params.snapshot_id with the exact current change-review fingerprint.`,
    inputSchema: {
      prompt: {
        type: 'string',
        description: 'The exact scoped question or review task.',
      },
      params: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            maxItems: MAX_REVIEWED_FILES,
            items: boundedString(MAX_PATH_LENGTH),
            description: 'Exact files in scope.',
          },
          snapshot_id: {
            type: 'string',
            maxLength: 512,
            description:
              'Required exact current change-review snapshot fingerprint from get_change_review_bundle. Do not invent or reuse a stale value.',
          },
          command: {
            type: 'string',
            maxLength: 4_000,
            description:
              'Optional bounded diagnostic command for terminal-enabled specialists.',
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
            snapshotFingerprint: boundedString(512),
            reviewedFiles: {
              type: 'array',
              maxItems: MAX_REVIEWED_FILES,
              items: boundedString(MAX_PATH_LENGTH),
            },
            dimensions: dimensionsSchema,
            findings: {
              type: 'array',
              maxItems: MAX_FINDINGS,
              items: findingSchema,
            },
            recommendations: boundedStringArray(20),
            evidence: boundedStringArray(20),
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
            snapshotFingerprint: boundedString(512),
            reviewedFiles: {
              type: 'array',
              maxItems: MAX_REVIEWED_FILES,
              items: boundedString(MAX_PATH_LENGTH),
            },
            coverage: {
              type: 'string',
              enum: ['covered', 'missing', 'n/a'],
            },
            dimensions: dimensionsSchema,
            findings: {
              type: 'array',
              maxItems: MAX_FINDINGS,
              items: findingSchema,
            },
            requirementCoverage: {
              type: 'array',
              maxItems: MAX_REQUIREMENTS,
              items: {
                type: 'object',
                properties: {
                  requirement: boundedString(),
                  status: {
                    type: 'string',
                    enum: ['satisfied', 'missing', 'uncertain'],
                  },
                  evidence: boundedStringArray(),
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
        ? ([
            'inspect_codebase_structure',
            'inspect_feature_completeness',
          ] as const)
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
      config.terminal
        ? 'Use only the tools exposed for this specialist. run_terminal_command is available only for the optional bounded diagnostic command; do not call a basher agent.'
        : 'Use only the tools exposed for this specialist. Do not call basher or run terminal validation; if runtime evidence is required, report the exact missing evidence for the parent to collect.',
      `Use these exact dimension keys: ${dimensionKeys.join(', ')}. Every finding ID must be stable and formatted ${config.id}:<dimension>:<slug>; include severity, concrete evidence, and an actionable correction. Keep the result compact: at most ${MAX_FINDINGS} findings and ${MAX_EVIDENCE_ITEMS} evidence items per finding. Call set_output with a JSON object directly; never JSON.stringify the object or wrap it in a string. Return the required structured output and do not modify files.`,
    ].join('\n'),
  }
}
