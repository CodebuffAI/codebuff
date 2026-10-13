/**
 * The opt-in project fence behind `RunOptions.confineFileToolsToProject`
 * (the project-understanding agent sets it; nothing else does). A path is inside the
 * project only when it is inside the root BOTH as written and after resolving
 * symlinks: a link inside the project that points elsewhere is outside.
 */
import path from 'path'

import { resolveFilePathWithinProject } from './path-utils'

import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

type RealpathFn = (p: string) => Promise<string>

function realpathOf(fs: CodebuffFileSystem): RealpathFn | null {
  const candidate = (fs as { realpath?: unknown }).realpath
  return typeof candidate === 'function'
    ? (p) => (candidate as RealpathFn).call(fs, p)
    : null
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined
}

/**
 * The real path of `fullPath`, or of its nearest existing ancestor with the
 * missing tail appended (a path that does not exist yet still has to land
 * inside the root). `null` when it cannot be resolved for any other reason
 * (a symlink loop, no permission): the caller refuses.
 */
async function realpathOrAncestor(
  realpath: RealpathFn,
  fullPath: string,
): Promise<string | null> {
  let current = fullPath
  const missing: string[] = []
  for (;;) {
    try {
      const real = await realpath(current)
      return missing.length ? path.join(real, ...missing.reverse()) : real
    } catch (error) {
      const code = errorCode(error)
      if (code !== 'ENOENT' && code !== 'ENOTDIR') return null
      const parent = path.dirname(current)
      if (parent === current) return null
      missing.push(path.basename(current))
      current = parent
    }
  }
}

function isInside(root: string, target: string, allowRoot: boolean): boolean {
  const relative = path.relative(root, target)
  if (relative === '') return allowRoot
  return (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

export type ProjectFence = {
  /**
   * The absolute path `filePath` names, when it is inside the project (as
   * written and through symlinks), else `null`. `allowRoot` admits the root
   * itself (list_directory '.', glob without a subfolder).
   */
  resolve: (
    filePath: string,
    options?: { allowRoot?: boolean },
  ) => Promise<string | null>
}

/**
 * A fence around `projectRoot`, read through `fs`. Needs `fs.realpath`
 * (`fs.promises` has it): on a filesystem without one, every path is refused,
 * because symlinks could not be checked.
 */
export function createProjectFence(params: {
  projectRoot: string
  fs: CodebuffFileSystem
}): ProjectFence {
  const root = path.resolve(params.projectRoot)
  const realpath = realpathOf(params.fs)
  let realRoot: Promise<string | null> | undefined
  return {
    resolve: async (filePath, options = {}) => {
      const allowRoot = options.allowRoot === true
      if (typeof filePath !== 'string' || filePath.includes('\0')) return null
      const lexical = resolveFilePathWithinProject(root, filePath)
      const fullPath =
        lexical?.fullPath ??
        (allowRoot && isInside(root, path.resolve(root, filePath), true)
          ? root
          : null)
      if (!fullPath) return null
      if (!realpath) return null
      realRoot ??= realpath(root).catch(() => null)
      const resolvedRoot = await realRoot
      if (!resolvedRoot) return null
      const real = await realpathOrAncestor(realpath, fullPath)
      if (!real || !isInside(resolvedRoot, real, true)) return null
      if (!allowRoot && path.relative(resolvedRoot, real) === '') return null
      return fullPath
    },
  }
}
