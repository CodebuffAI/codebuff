import { createHash } from 'node:crypto'
import path from 'node:path'

import { LocalHarnessStore } from '../services/local-harness-store'
import { gitStatus, runGit } from './git-status'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'

function repositoryId(root: string): string {
  return createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 24)
}

export async function getChangeReviewBundle(params: {
  cwd: string
  stateDir?: string
  max_chars?: number
  signal?: AbortSignal
}): Promise<CodebuffToolOutput<'get_change_review_bundle'>> {
  const [git, head] = await Promise.all([
    gitStatus({
      cwd: params.cwd,
      include_diff: true,
      max_chars: params.max_chars ?? 80_000,
      signal: params.signal,
    }),
    runGit(['rev-parse', 'HEAD'], params.cwd, params.signal),
  ])
  const value = git[0]?.type === 'json' ? git[0].value : undefined
  if (!value || 'errorMessage' in value || head.exitCode !== 0) {
    return [
      {
        type: 'json',
        value: {
          errorMessage:
            (value && 'errorMessage' in value ? value.errorMessage : undefined) ??
            head.stderr.trim() ??
            'Unable to build change review bundle.',
        },
      },
    ]
  }
  const headCommit = head.stdout.trim()
  const status = value.status
  const diff = value.diff ?? ''
  const snapshotId = createHash('sha256')
    .update(`${headCommit}\0${status}\0${diff}`)
    .digest('hex')
  const files = status
    .split('\n')
    .slice(1)
    .map((line) => line.slice(3).split(' -> ').at(-1)?.trim() ?? '')
    .filter(Boolean)
  let ownership: Record<string, unknown>[] = []
  let validation: Record<string, unknown>[] = []
  let findings: Record<string, unknown>[] = []
  if (params.stateDir) {
    const store = new LocalHarnessStore(params.stateDir)
    const repoId = repositoryId(params.cwd)
    ownership = store.list(repoId, 'ownership')
    validation = store.list(repoId, 'validation')
    findings = store
      .list(repoId, 'findings')
      .filter((record) => record.status !== 'resolved')
  }
  return [
    {
      type: 'json',
      value: {
        snapshotId,
        headCommit,
        status,
        files,
        diff,
        truncated: value.truncated ?? false,
        ownership,
        validation,
        findings,
      },
    },
  ]
}
