import z from 'zod/v4'

import { jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

export const auditFindingSeveritySchema = z.enum([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
])

export const auditFindingDomainSchema = z.enum([
  'security',
  'correctness',
  'state-mutation',
  'error-handling',
  'performance',
  'dependency-hygiene',
  'test-coverage',
  'api-abi',
])

export const auditFindingSchema = z.object({
  severity: auditFindingSeveritySchema,
  domain: auditFindingDomainSchema,
  path: z.string().min(1).max(500),
  line: z.number().int().positive().optional(),
  title: z.string().min(1).max(300),
  risk: z.string().min(1).max(2_000),
  fix: z.string().min(1).max(2_000),
  evidence: z.string().min(1).max(4_000),
})

const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[A-Za-z0-9._-]+$/,
    'Use only letters, digits, dot, underscore, or dash',
  )
  .refine((value) => value !== '.' && value !== '..', {
    message: 'Dot path segments are not valid audit identifiers',
  })

const inputSchema = z
  .object({
    sessionSlug: slugSchema.describe(
      'Existing durable audit session slug under .agents/sessions/.',
    ),
    shardId: slugSchema.describe(
      'Unique shard identifier used as the findings filename.',
    ),
    findings: z.array(auditFindingSchema).max(100),
    coverage: z.object({
      subsystemIds: z.array(z.string().min(1).max(200)).max(100),
      featureIds: z.array(z.string().min(1).max(200)).max(100),
      files: z.array(z.string().min(1).max(500)).max(500),
    }),
    noIssuesFound: z.boolean().default(false),
  })
  .superRefine((input, ctx) => {
    if (input.noIssuesFound === input.findings.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['noIssuesFound'],
        message:
          'Set noIssuesFound=true only when findings is empty; otherwise set it to false.',
      })
    }
  })

export const auditFindingsReceiptSchema = z.object({
  artifactPath: z.string(),
  artifacts: z.array(z.string()).length(1),
  findingCount: z.number().int().nonnegative(),
  severityCounts: z.record(
    auditFindingSeveritySchema,
    z.number().int().nonnegative(),
  ),
  coverage: z.object({
    subsystemCount: z.number().int().nonnegative(),
    featureCount: z.number().int().nonnegative(),
    fileCount: z.number().int().nonnegative(),
  }),
  contentHash: z.string(),
})

export const auditFindingsErrorSchema = z.object({
  errorMessage: z.string(),
  artifactPath: z.string(),
})

const toolName = 'write_audit_findings'

export const writeAuditFindingsParams = {
  toolName,
  endsAgentStep: false,
  description: `Persist one audit shard's structured findings to a runtime-owned Markdown artifact. The path is derived as .agents/sessions/<sessionSlug>/findings/<shardId>.md; callers cannot choose another path. Return only the compact receipt after writing—do not repeat findings in prose.`,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([auditFindingsReceiptSchema, auditFindingsErrorSchema]),
  ),
} satisfies $ToolParams

export type AuditFindingsInput = z.infer<typeof inputSchema>
