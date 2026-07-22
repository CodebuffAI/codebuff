import path from 'path'

/**
 * True when candidate is lexically root itself or one of its descendants.
 * Resolve symlinks first when the caller needs filesystem-level containment.
 */
export function isPathInside(root: string, candidate: string): boolean {
  const relativePath = path.relative(root, candidate)
  return (
    relativePath === '' ||
    (relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  )
}
