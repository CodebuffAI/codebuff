import path from 'node:path'

import { resolveWorkspaceIdentity } from '../services/repository-identity'
import { runGit } from './git-status'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'

export async function inspectWorkspace(params: {
  cwd: string
  signal?: AbortSignal
}): Promise<CodebuffToolOutput<'inspect_workspace'>> {
  const commands = await Promise.all([
    runGit(['branch', '--show-current'], params.cwd, params.signal),
    runGit(
      ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
      params.cwd,
      params.signal,
    ),
    runGit(['rev-parse', 'HEAD'], params.cwd, params.signal),
    runGit(['status', '--short', '--branch'], params.cwd, params.signal),
    runGit(
      ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'],
      params.cwd,
      params.signal,
    ),
  ])
  const [branch, upstream, head, status, defaultRef] = commands
  let identity
  try {
    identity = await resolveWorkspaceIdentity(params)
  } catch (error) {
    return [
      {
        type: 'json',
        value: {
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Unable to inspect the current Git workspace.',
        },
      },
    ]
  }
  if (head.exitCode !== 0) {
    return [
      {
        type: 'json',
        value: {
          errorMessage:
            head.stderr.trim() ||
            'Unable to inspect the current Git workspace.',
        },
      },
    ]
  }
  const statusText = status.stdout.trimEnd()
  const statusLines = statusText.split('\n').filter(Boolean)
  return [
    {
      type: 'json',
      value: {
        repositoryId: identity.repositoryId,
        workspaceId: identity.workspaceId,
        canonicalRoot: identity.canonicalRoot,
        repositoryRoot: identity.repositoryRoot,
        workingDirectory: path.resolve(params.cwd),
        gitCommonDir: identity.gitCommonDir,
        isLinkedWorktree:
          path.resolve(identity.repositoryRoot, '.git') !==
          identity.gitCommonDir,
        ...(branch.stdout.trim() ? { branch: branch.stdout.trim() } : {}),
        ...(upstream.exitCode === 0 && upstream.stdout.trim()
          ? { upstream: upstream.stdout.trim() }
          : {}),
        ...(defaultRef.exitCode === 0 && defaultRef.stdout.trim()
          ? { defaultBranch: defaultRef.stdout.trim().split('/').at(-1) }
          : {}),
        headCommit: head.stdout.trim(),
        dirty: statusLines.slice(1).length > 0,
        status: statusText,
      },
    },
  ]
}
