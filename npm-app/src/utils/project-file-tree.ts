import fs from 'fs'
import path from 'path'

import { DEFAULT_IGNORED_PATHS } from '@codebuff/common/old-constants'
import * as ignore from 'ignore'

function rebaseGitignorePattern(
  rawPattern: string,
  relativeDirPath: string,
): string {
  // Preserve negation and directory-only flags
  const isNegated = rawPattern.startsWith('!')
  let pattern = isNegated ? rawPattern.slice(1) : rawPattern

  const dirOnly = pattern.endsWith('/')
  // Strip the trailing slash for slash-detection only
  const core = dirOnly ? pattern.slice(0, -1) : pattern

  const anchored = core.startsWith('/') // anchored to .gitignore dir
  // Detect if the "meaningful" part (minus optional leading '/' and trailing '/')
  // contains a slash. If not, git treats it as recursive.
  const coreNoLead = anchored ? core.slice(1) : core
  const hasSlash = coreNoLead.includes('/')

  // Build the base (where this .gitignore lives relative to projectRoot)
  const base = relativeDirPath.replace(/\\/g, '/') // normalize

  let rebased: string
  if (anchored) {
    // "/foo" from evals/.gitignore -> "evals/foo"
    rebased = base ? `${base}/${coreNoLead}` : coreNoLead
  } else if (!hasSlash) {
    // "logs" or "logs/" should recurse from evals/: "evals/**/logs[/]"
    if (base) {
      rebased = `${base}/**/${coreNoLead}`
    } else {
      // At project root already; "logs" stays "logs" to keep recursive semantics
      rebased = coreNoLead
    }
  } else {
    // "foo/bar" relative to evals/: "evals/foo/bar"
    rebased = base ? `${base}/${coreNoLead}` : coreNoLead
  }

  if (dirOnly && !rebased.endsWith('/')) {
    rebased += '/'
  }

  // Normalize to forward slashes
  rebased = rebased.replace(/\\/g, '/')

  return isNegated ? `!${rebased}` : rebased
}

export function parseGitignore(params: {
  fullDirPath: string
  projectRoot: string
}): ignore.Ignore {
  const { fullDirPath, projectRoot } = params

  const ig = ignore.default()
  const relativeDirPath = path.relative(projectRoot, fullDirPath)
  const ignoreFiles = [
    path.join(fullDirPath, '.gitignore'),
    path.join(fullDirPath, '.codebuffignore'),
    path.join(fullDirPath, '.manicodeignore'), // Legacy support
  ]

  for (const ignoreFilePath of ignoreFiles) {
    if (!fs.existsSync(ignoreFilePath)) continue

    const ignoreContent = fs.readFileSync(ignoreFilePath, 'utf8')
    const lines = ignoreContent.split('\n')
    for (let line of lines) {
      line = line.trim()
      if (line === '' || line.startsWith('#')) continue

      const finalPattern = rebaseGitignorePattern(line, relativeDirPath)

      ig.add(finalPattern)
    }
  }

  return ig
}

export function isFileIgnoredSync(params: {
  filePath: string
  projectRoot: string
}): boolean {
  const { filePath, projectRoot } = params

  const defaultIgnore = ignore.default()
  for (const pattern of DEFAULT_IGNORED_PATHS) {
    defaultIgnore.add(pattern)
  }

  const relativeFilePath = path.relative(
    projectRoot,
    path.join(projectRoot, filePath),
  )
  const dirPath = path.dirname(path.join(projectRoot, filePath))

  // Get ignore patterns from the directory containing the file and all parent directories
  const mergedIgnore = ignore.default().add(defaultIgnore)
  let currentDir = dirPath
  while (currentDir.startsWith(projectRoot)) {
    mergedIgnore.add(parseGitignore({ fullDirPath: currentDir, projectRoot }))
    currentDir = path.dirname(currentDir)
  }

  return mergedIgnore.ignores(relativeFilePath)
}
