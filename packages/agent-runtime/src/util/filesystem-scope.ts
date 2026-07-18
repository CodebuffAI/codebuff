import path from 'node:path'

export function scopePatternMatches(
  filePath: string,
  pattern: string,
): boolean {
  const normalizedPattern = pattern.replace(/\\/g, '/').replace(/^\.\//, '')

  // A recursive directory scope authorizes the directory entry as well as its
  // descendants. This matters for tools such as read_subtree, which validate
  // the requested directory before traversing its children.
  if (
    normalizedPattern.endsWith('/**') &&
    scopePatternMatches(filePath, normalizedPattern.slice(0, -3))
  ) {
    return true
  }

  let source = '^'
  for (let index = 0; index < normalizedPattern.length; index++) {
    const char = normalizedPattern[index]
    if (char === '*' && normalizedPattern[index + 1] === '*') {
      if (normalizedPattern[index + 2] === '/') {
        // Globstar directory prefixes may match zero directories. Without the
        // optional group, **/* incorrectly requires a slash and rejects every
        // root-level file or directory.
        source += '(?:.*/)?'
        index += 2
      } else {
        source += '.*'
        index++
      }
    } else if (char === '*') {
      source += '[^/]*'
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`${source}$`).test(filePath)
}

export function normalizeScopedToolPath(
  rawPath: string,
  projectRoot: string,
): string {
  const absolute = path.isAbsolute(rawPath)
    ? path.resolve(rawPath)
    : path.resolve(projectRoot, rawPath)
  const relative = path.relative(projectRoot, absolute).replace(/\\/g, '/')
  return relative || '.'
}

export function narrowFilesystemPatterns(params: {
  requested: string[]
  staticPatterns: string[] | undefined
  projectRoot: string
  access: 'read' | 'write'
  agentId: string
}): string[] {
  const normalized = [...new Set(params.requested)].map((requested) =>
    normalizeScopedToolPath(requested, params.projectRoot),
  )
  const invalid = normalized.filter(
    (requested) =>
      requested === '..' ||
      requested.startsWith('../') ||
      path.isAbsolute(requested) ||
      (params.staticPatterns !== undefined &&
        !params.staticPatterns.some((pattern) =>
          scopePatternMatches(requested, pattern),
        )),
  )
  if (invalid.length > 0) {
    throw new Error(
      `Handoff attempted to widen ${params.agentId} filesystem ${params.access} authority for: ${invalid.join(', ')}.`,
    )
  }
  return normalized
}
