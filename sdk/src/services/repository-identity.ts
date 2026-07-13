import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { runGit } from '../tools/git-status'

function canonicalPath(value: string): string {
  const resolved = path.resolve(value)
  try {
    return fs.realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

function identity(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

export type WorkspaceIdentity = {
  repositoryId: string
  workspaceId: string
  repositoryRoot: string
  gitCommonDir: string
  canonicalRoot: string
}

export async function resolveWorkspaceIdentity(params: {
  cwd: string
  signal?: AbortSignal
}): Promise<WorkspaceIdentity> {
  const [root, commonDir] = await Promise.all([
    runGit(['rev-parse', '--show-toplevel'], params.cwd, params.signal),
    runGit(['rev-parse', '--git-common-dir'], params.cwd, params.signal),
  ])
  if (root.exitCode !== 0 || commonDir.exitCode !== 0) {
    throw new Error(
      root.stderr.trim() ||
        commonDir.stderr.trim() ||
        'Unable to resolve Git repository identity.',
    )
  }
  const repositoryRoot = canonicalPath(
    path.resolve(params.cwd, root.stdout.trim()),
  )
  const gitCommonDir = canonicalPath(
    path.resolve(repositoryRoot, commonDir.stdout.trim()),
  )
  return {
    repositoryId: identity(gitCommonDir),
    workspaceId: identity(repositoryRoot),
    repositoryRoot,
    gitCommonDir,
    canonicalRoot: path.dirname(gitCommonDir),
  }
}
