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

  return {
    fullPath: fullPath.replace(/\\/g, '/'),
    relativePath: relativePath.replace(/\\/g, '/'),
  }
}

export function getProjectPathLookupKeys(
  projectRoot: string,
  filePath: string,
): string[] {
  const resolvedPath = resolveFilePathWithinProject(projectRoot, filePath)
  const keys = resolvedPath ? [resolvedPath.relativePath, filePath] : [filePath]

  return [...new Set(keys)]
}
