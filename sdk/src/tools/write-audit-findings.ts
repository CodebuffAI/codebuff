import { toolParams } from '@codebuff/common/tools/list'
import { fileMutationResultV1Schema } from '@codebuff/common/tools/results/filesystem'
import { getContentHash } from '@codebuff/common/util/content-hash'

import { changeFile } from './change-file'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { FileFilter } from './read-files'
import type { FilesystemAuthorityPolicy } from './filesystem-authority'

export function auditFindingsArtifactPath(params: {
  sessionSlug: string
  shardId: string
}): string {
  return `.agents/sessions/${params.sessionSlug}/findings/${params.shardId}.md`
}

export function renderAuditFindingsMarkdown(
  input: ReturnType<typeof toolParams.write_audit_findings.inputSchema.parse>,
): string {
  const lines = [
    `# Audit findings: ${input.shardId}`,
    '',
    `- Subsystems: ${input.coverage.subsystemIds.join(', ') || '(none)'}`,
    `- Features: ${input.coverage.featureIds.join(', ') || '(none)'}`,
    `- Files covered: ${input.coverage.files.length}`,
    '',
  ]
  if (input.noIssuesFound) {
    lines.push('No issues found across all 8 domains.', '')
  }
  for (const finding of input.findings) {
    const location = `${finding.path}${finding.line ? `:${finding.line}` : ''}`
    lines.push(
      `## [${finding.severity}] ${finding.domain} — ${location} — ${finding.title}`,
      `- **Risk:** ${finding.risk}`,
      `- **Fix:** ${finding.fix}`,
      `- **Evidence:** ${finding.evidence}`,
      '',
    )
  }
  lines.push('## Coverage receipt', '')
  lines.push(
    '### Subsystems',
    ...input.coverage.subsystemIds.map((id) => `- ${id}`),
    '',
  )
  lines.push(
    '### Features',
    ...input.coverage.featureIds.map((id) => `- ${id}`),
    '',
  )
  lines.push(
    '### Files',
    ...input.coverage.files.map((file) => `- ${file}`),
    '',
  )
  return lines.join('\n')
}

export async function writeAuditFindings(params: {
  parameters: unknown
  cwd: string
  fs: CodebuffFileSystem
  signal?: AbortSignal
  fileFilter?: FileFilter
  filesystemPolicy?: FilesystemAuthorityPolicy
  callId?: string
}): Promise<CodebuffToolOutput<'write_audit_findings'>> {
  const input = toolParams.write_audit_findings.inputSchema.parse(
    params.parameters,
  )
  const artifactPath = auditFindingsArtifactPath(input)
  const content = renderAuditFindingsMarkdown(input)
  const mutationOutput = await changeFile({
    parameters: {
      type: 'file',
      path: artifactPath,
      content,
      expectedHash: null,
    },
    cwd: params.cwd,
    fs: params.fs,
    signal: params.signal,
    fileFilter: params.fileFilter,
    filesystemPolicy: params.filesystemPolicy,
    callId: params.callId,
  })
  const mutationPart = mutationOutput.find((part) => part.type === 'json')
  const mutation = fileMutationResultV1Schema.safeParse(mutationPart?.value)
  if (!mutation.success || mutation.data.outcome !== 'applied') {
    const message = mutation.success
      ? mutation.data.errors.map((error) => error.message).join('; ')
      : 'Audit findings artifact was not confirmed as written.'
    return [
      {
        type: 'json',
        value: { artifactPath, errorMessage: message },
      },
    ]
  }
  const severityCounts = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  }
  for (const finding of input.findings) severityCounts[finding.severity]++
  return [
    {
      type: 'json',
      value: {
        artifactPath,
        artifacts: [artifactPath],
        findingCount: input.findings.length,
        severityCounts,
        coverage: {
          subsystemCount: input.coverage.subsystemIds.length,
          featureCount: input.coverage.featureIds.length,
          fileCount: input.coverage.files.length,
        },
        contentHash: getContentHash(content),
      },
    },
  ]
}
