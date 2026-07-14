import path from 'node:path'

export function scopePatternMatches(
  filePath: string,
  pattern: string,
): boolean {
  const normalizedPattern = pattern.replace(/\\/g, '/').replace(/^\.\//, '')
  let source = '^'
  for (let index = 0; index < normalizedPattern.length; index++) {
    const char = normalizedPattern[index]
    if (char === '*' && normalizedPattern[index + 1] === '*') {
      source += '.*'
      index++
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
