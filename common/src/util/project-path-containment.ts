import fs from 'fs'
import path from 'path'

/**
 * Result of resolving a caller-supplied path against a project root.
 *
 * - `fullPath` is the absolute, OS-native path to use for actual filesystem
 *   operations. For a symlinked path inside the project this is the original
 *   lexical path; `realFullPath` carries the symlink-dereferenced form.
 * - `relativePath` is the project-relative form of the path, with OS-native
 *   separators (i.e. whatever `path.relative` produces). Callers can use it
 *   as a lookup key into a project file tree built with the same
 *   convention.
 */
export type ContainedProjectPath = {
  fullPath: string
  realFullPath: string
  relativePath: string
}

/**
 * Walk up from `fsPath` to the nearest existing ancestor, realpath that,
 * then reconstruct the non-existent tail. When nothing on the chain exists
 * (e.g. a synthetic test root like `/repo`), fall back to the lexical path
 * so callers can keep using the helper in unit tests with non-existent
 * roots.
 */
function realpathOrLexical(fsPath: string): string {
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
          return fsPath
        }
        tail.push(path.basename(current))
        current = path.dirname(current)
      }
    }
  }
}

// Cache of project-root lexical path -> realpath. Project roots are stable
// for a run's lifetime, so this avoids a realpathSync syscall per tool
// invocation. Shared by all callers across the SDK and the agent runtime
// that import this helper.
const projectRootRealpathCache = new Map<string, string>()

/**
 * Resolve `input` against `projectRoot` and verify it stays inside the
 * project. Returns `null` when:
 *
 * - the input is empty;
 * - the path lexically escapes the project (`..` at the root, an absolute
 *   path outside the root, or a sibling prefix like `/repo-evil` when the
 *   project root is `/repo`);
 * - the symlink-dereferenced path resolves to a location outside the real
 *   project root (e.g. an in-project symlink that points outside the repo).
 *
 * This is the canonical, package-boundary-safe containment check. The SDK
 * (`sdk/src/tools/path-utils.ts`) and the agent runtime
 * (`packages/agent-runtime`) both call this helper instead of
 * re-implementing the same logic.
 */
export function resolveProjectPath(
  projectRoot: string,
  input: string,
): ContainedProjectPath | null {
  if (!input) return null

  const resolvedRoot = path.resolve(projectRoot)
  const fullPath = path.isAbsolute(input)
    ? path.resolve(input)
    : path.resolve(resolvedRoot, input)

  // Fast lexical check: any `..` segment, or the path landing outside the
  // root lexically, is an immediate reject. We require either an exact
  // `..` or a `..` immediately followed by a separator so file names that
  // start with two dots (e.g. `..config`) are still allowed.
  const relativeLexical = path.relative(resolvedRoot, fullPath)
  if (
    relativeLexical === '' ||
    relativeLexical === '..' ||
    relativeLexical.startsWith('..' + path.sep) ||
    path.isAbsolute(relativeLexical) ||
    relativeLexical.split(path.sep).includes('..')
  ) {
    return null
  }

  // Symlink containment: verify the real path is still inside the real root.
  let realRoot = projectRootRealpathCache.get(resolvedRoot)
  if (realRoot === undefined) {
    realRoot = realpathOrLexical(resolvedRoot)
    projectRootRealpathCache.set(resolvedRoot, realRoot)
  }
  const realFullPath = realpathOrLexical(fullPath)
  const realRelative = path.relative(realRoot, realFullPath)
  if (
    realRelative === '' ||
    realRelative === '..' ||
    realRelative.startsWith('..' + path.sep) ||
    path.isAbsolute(realRelative)
  ) {
    return null
  }

  return {
    fullPath,
    realFullPath,
    relativePath: relativeLexical,
  }
}

/**
 * Boolean convenience wrapper for tools that only need to know "is this path
 * inside the project root?" without the resolved metadata.
 */
export function isPathInsideProject(
  projectRoot: string,
  input: string,
): boolean {
  return resolveProjectPath(projectRoot, input) !== null
}

/**
 * Build a deduped list of lookup keys for indexing a path into a project
 * file tree. The first key is the project-relative form; the second is the
 * original input (absolute or relative as given). The result is suitable
 * for `Array.includes` / `Set.has` lookups in code that doesn't know
 * whether the caller will pass an absolute or project-relative path.
 */
export function getProjectPathLookupKeys(
  projectRoot: string,
  input: string,
): string[] {
  const resolvedPath = resolveProjectPath(projectRoot, input)
  const keys = resolvedPath ? [resolvedPath.relativePath, input] : [input]
  return [...new Set(keys)]
}
