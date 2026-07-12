import path from 'path'

import {
  resolveProjectPath,
  resolveProjectPathForFileSystem,
  type ContainedProjectPath,
} from '@codebuff/common/util/project-path-containment'

import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

/**
 * Prompt-supplied filesystem paths are project-relative portable paths. Reject
 * ambiguous platform-specific absolute forms and traversal before any I/O.
 */
export function isSafeProjectRelativePath(input: string): boolean {
  if (!input || input.includes('\0')) return false
  if (
    path.isAbsolute(input) ||
    /^[a-zA-Z]:[\\/]/.test(input) ||
    input.startsWith('\\\\') ||
    input.startsWith('//')
  ) {
    return false
  }
  return !input.split(/[\\/]+/).includes('..')
}

/**
 * SDK-side re-export of the canonical project-path containment helpers
 * living in `common/`. The real implementation (lexical + realpath/symlink
 * containment, per-project-root realpath cache, synthetic-root fallback) is
 * in `common/src/util/project-path-containment.ts`. Keeping the SDK names
 * stable here preserves the existing public SDK surface for callers in
 * this package (`apply-patch`, `change-file`, `git-status`, `glob`,
 * `list-directory`, `read-files`, `read-image`, `replace-range`, and
 * `run.ts`).
 */
export {
  resolveProjectPath as resolveFilePathWithinProject,
  getProjectPathLookupKeys,
  isPathInsideProject,
  type ContainedProjectPath as ResolvedProjectPath,
} from '@codebuff/common/util/project-path-containment'

export type ResolvedOperationPath = ContainedProjectPath & {
  operationPath: string
}

/**
 * Resolve a project path for immediate filesystem/process use.
 *
 * The public `resolveFilePathWithinProject` helper preserves the caller's
 * lexical path for lookup/display compatibility. Filesystem operations should
 * instead use `operationPath`, which pins the already-dereferenced in-project
 * target so swapping the caller-supplied symlink path cannot redirect the
 * operation outside the project.
 *
 * Unlink-style operations set `followFinalSymlink: false`: parent-directory
 * symlinks are still dereferenced and contained, while the final path component
 * remains the link itself so deleting an allowed in-project symlink does not
 * delete its target.
 */
export function resolveFilePathForOperation(
  projectRoot: string,
  input: string,
  options: { followFinalSymlink?: boolean } = {},
): ResolvedOperationPath | null {
  const resolved = resolveProjectPath(projectRoot, input)
  if (!resolved) return null

  if (options.followFinalSymlink !== false) {
    return { ...resolved, operationPath: resolved.realFullPath }
  }

  const parent = resolveProjectPath(
    projectRoot,
    path.dirname(resolved.fullPath),
  )
  if (!parent) return null

  return {
    ...resolved,
    operationPath: path.join(
      parent.realFullPath,
      path.basename(resolved.fullPath),
    ),
  }
}

/** Filesystem-aware counterpart used whenever the operation itself runs
 * through an injected CodebuffFileSystem. */
export async function resolveFilePathForFileSystemOperation(
  projectRoot: string,
  input: string,
  fileSystem: CodebuffFileSystem,
  options: { followFinalSymlink?: boolean } = {},
): Promise<ResolvedOperationPath | null> {
  const resolved = await resolveProjectPathForFileSystem(
    projectRoot,
    input,
    fileSystem,
  )
  if (!resolved) return null

  if (options.followFinalSymlink !== false) {
    return { ...resolved, operationPath: resolved.realFullPath }
  }

  const parent = await resolveProjectPathForFileSystem(
    projectRoot,
    path.dirname(resolved.fullPath),
    fileSystem,
  )
  if (!parent) return null
  return {
    ...resolved,
    operationPath: path.join(
      parent.realFullPath,
      path.basename(resolved.fullPath),
    ),
  }
}
