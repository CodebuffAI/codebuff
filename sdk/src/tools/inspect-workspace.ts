import path from 'node:path'

import { runGit } from './git-status'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'

export async function inspectWorkspace(params: {
  cwd: string
  signal?: AbortSignal
}): Promise<CodebuffToolOutput<'inspect_workspace'>> {
  const commands = await Promise.all([
    runGit(['rev-parse', '--show-toplevel'], params.cwd, params.signal),
    runGit(['rev-parse', '--git-common-dir'], params.cwd, params.signal),
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
  const [root, commonDir, branch, upstream, head, status, defaultRef] = commands
  if (root.exitCode !== 0 || commonDir.exitCode !== 0 || head.exitCode !== 0) {
    return [
      {
        type: 'json',
        value: {
          errorMessage:
            root.stderr.trim() ||
            commonDir.stderr.trim() ||
            head.stderr.trim() ||
            'Unable to inspect the current Git workspace.',
        },
      },
    ]
  }
  const repositoryRoot = path.resolve(params.cwd, root.stdout.trim())
  const gitCommonDir = path.resolve(repositoryRoot, commonDir.stdout.trim())
  const statusText = status.stdout.trimEnd()
  const statusLines = statusText.split('\n').filter(Boolean)
  return [
    {
      type: 'json',
      value: {
        repositoryRoot,
        workingDirectory: path.resolve(params.cwd),
        gitCommonDir,
        isLinkedWorktree: path.resolve(repositoryRoot, '.git') !== gitCommonDir,
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
