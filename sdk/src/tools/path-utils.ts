import fs from 'fs'
import path from 'path'

export type ResolvedProjectPath = {
  fullPath: string
  relativePath: string
}

function escapesProject(relativePath: string): boolean {
  return (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  )
}

// Cache of project-root lexical path -> realpath. Project roots are stable for
// a run's lifetime, so this avoids a realpathSync syscall per tool invocation.
const projectRootRealpathCache = new Map<string, string>()

/**
 * Resolve a path to its real (symlink-dereferenced) form. When the target does
 * not exist (e.g. a file about to be created, or test mocks that use synthetic
 * paths like `/repo`), walk up to the nearest existing ancestor, realpath that,
 * then reconstruct the non-existent tail. If nothing exists at all, fall back
 * to the lexical path so prior behavior is preserved.
 */
function resolveRealPath(fsPath: string): string {
  try {
    return fs.realpathSync(fsPath)
  } catch {
    const tail: string[] = []
    let current = fsPath
    while (true) {
      try {
        const realAncestor = fs.realpathSync(current)
        return tail.length === 0
          ? realAncestor
          : path.join(realAncestor, ...tail.reverse())
      } catch {
        if (current === path.dirname(current)) {
          // Reached the filesystem root without finding anything existing.
          // Return the original lexical path (test-mock / synthetic-path case).
          return fsPath
        }
        tail.push(path.basename(current))
        current = path.dirname(current)
      }
    }
  }
}

export function resolveFilePathWithinProject(
  projectRoot: string,
  filePath: string,
): ResolvedProjectPath | null {
  const resolvedRoot = path.resolve(projectRoot)
  const fullPath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(resolvedRoot, filePath)

  // Fast lexical check (catches obvious traversal without syscalls).
  const relativePath = path.relative(resolvedRoot, fullPath)
  if (relativePath === '' || escapesProject(relativePath)) {
    return null
  }

  // Symlink containment: verify the real path is still inside the real root.
  // This blocks in-project symlinks that point outside the project root.
  let realRoot = projectRootRealpathCache.get(resolvedRoot)
  if (realRoot === undefined) {
    realRoot = resolveRealPath(resolvedRoot)
    projectRootRealpathCache.set(resolvedRoot, realRoot)
  }
  const realFullPath = resolveRealPath(fullPath)
  const realRelative = path.relative(realRoot, realFullPath)
  if (realRelative === '' || escapesProject(realRelative)) {
    return null
  }

  return { fullPath, relativePath }
}

export function getProjectPathLookupKeys(
  projectRoot: string,
  filePath: string,
): string[] {
  const resolvedPath = resolveFilePathWithinProject(projectRoot, filePath)
  const keys = resolvedPath ? [resolvedPath.relativePath, filePath] : [filePath]

  return [...new Set(keys)]
}
