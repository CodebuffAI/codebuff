import path from 'path'

export type ResolvedProjectPath = {
  fullPath: string
  relativePath: string
}

export type ResolvedFilePath = ResolvedProjectPath & {
  /** Whether the resolved path lives inside `projectRoot`. */
  isWithinProject: boolean
}

function escapesProject(relativePath: string): boolean {
  return (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  )
}

export function resolveFilePathWithinProject(
  projectRoot: string,
  filePath: string,
): ResolvedProjectPath | null {
  const resolvedRoot = path.resolve(projectRoot)
  const fullPath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(resolvedRoot, filePath)
  const relativePath = path.relative(resolvedRoot, fullPath)

  if (relativePath === '' || escapesProject(relativePath)) {
    return null
  }

  return { fullPath, relativePath }
}

/**
 * Resolves a file path against the project root without restricting it to the
 * project directory. Absolute paths are honored as-is and relative paths are
 * resolved against the project root, so callers can operate on any file on the
 * system. `relativePath` is a friendly display value: the project-relative path
 * when the target is inside the project, otherwise the absolute path.
 * `isWithinProject` lets callers skip project-scoped logic (e.g. gitignore) for
 * files that live outside the project.
 */
export function resolveFilePath(
  projectRoot: string,
  filePath: string,
): ResolvedFilePath {
  const resolvedRoot = path.resolve(projectRoot)
  const fullPath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(resolvedRoot, filePath)
  const relativePath = path.relative(resolvedRoot, fullPath)
  const isWithinProject = relativePath !== '' && !escapesProject(relativePath)
  const displayPath = isWithinProject ? relativePath : fullPath

  return { fullPath, relativePath: displayPath, isWithinProject }
}

export function getProjectPathLookupKeys(
  projectRoot: string,
  filePath: string,
): string[] {
  const resolvedPath = resolveFilePathWithinProject(projectRoot, filePath)
  const keys = resolvedPath ? [resolvedPath.relativePath, filePath] : [filePath]

  return [...new Set(keys)]
}
