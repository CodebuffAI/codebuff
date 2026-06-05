import * as fs from 'node:fs'

import { getFileTokenScores } from '@codebuff/code-map'

import { walkProject } from './file-walker'
import { sanitizeIndexCacheDir } from './index-store'
import type { IndexedFile, IndexingConfig, MetadataIndex } from './types'

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.cs', '.cpp', '.hpp', '.rs', '.rb', '.go',
])

const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.rst'])

const IMPORT_REGEX = /(?:import|require)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g

export async function buildMetadataIndex(
  projectRoot: string,
  config: IndexingConfig = {},
): Promise<MetadataIndex> {
  const files = await walkProject(projectRoot, getIndexExcludes(config))

  const codeFilePaths = files
    .filter((f) => CODE_EXTENSIONS.has(f.ext))
    .map((f) => f.relativePath)

  let tokenScores: Record<string, Record<string, number>> = {}
  if (codeFilePaths.length > 0) {
    try {
      const data = await getFileTokenScores(projectRoot, codeFilePaths)
      tokenScores = data.tokenScores
    } catch {
      // code-map parse errors are non-fatal; proceed with empty symbols
    }
  }

  const indexedFiles: Record<string, IndexedFile> = {}

  for (const file of files) {
    let content = ''
    try {
      content = await fs.promises.readFile(file.absolutePath, 'utf8')
    } catch {
      continue
    }

    const symbols = getTopSymbols(tokenScores[file.relativePath] ?? {}, 30)
    const imports = extractImports(content)
    const headings = DOC_EXTENSIONS.has(file.ext) ? extractHeadings(content) : []

    indexedFiles[file.relativePath] = {
      path: file.relativePath,
      mtime: file.mtime,
      size: file.size,
      ext: file.ext,
      symbols,
      imports,
      headings,
    }
  }

  return {
    version: '1',
    projectRoot,
    builtAt: Date.now(),
    fileCount: Object.keys(indexedFiles).length,
    files: indexedFiles,
  }
}

export async function updateMetadataIndex(
  existing: MetadataIndex,
  projectRoot: string,
  config: IndexingConfig = {},
): Promise<MetadataIndex> {
  const files = await walkProject(projectRoot, getIndexExcludes(config))

  const changedFiles = files.filter((f) => {
    const indexed = existing.files[f.relativePath]
    return !indexed || indexed.mtime !== f.mtime || indexed.size !== f.size
  })

  const deletedPaths = new Set(Object.keys(existing.files))
  for (const f of files) {
    deletedPaths.delete(f.relativePath)
  }

  if (changedFiles.length === 0 && deletedPaths.size === 0) {
    return existing
  }

  const changedCodeFilePaths = changedFiles
    .filter((f) => CODE_EXTENSIONS.has(f.ext))
    .map((f) => f.relativePath)

  let tokenScores: Record<string, Record<string, number>> = {}
  if (changedCodeFilePaths.length > 0) {
    try {
      const data = await getFileTokenScores(projectRoot, changedCodeFilePaths)
      tokenScores = data.tokenScores
    } catch {
      // non-fatal
    }
  }

  const updatedFiles: Record<string, IndexedFile> = { ...existing.files }

  for (const deletedPath of deletedPaths) {
    delete updatedFiles[deletedPath]
  }

  for (const file of changedFiles) {
    let content = ''
    try {
      content = await fs.promises.readFile(file.absolutePath, 'utf8')
    } catch {
      continue
    }

    const symbols = getTopSymbols(tokenScores[file.relativePath] ?? {}, 30)
    const imports = extractImports(content)
    const headings = DOC_EXTENSIONS.has(file.ext) ? extractHeadings(content) : []

    updatedFiles[file.relativePath] = {
      path: file.relativePath,
      mtime: file.mtime,
      size: file.size,
      ext: file.ext,
      symbols,
      imports,
      headings,
    }
  }

  return {
    version: '1',
    projectRoot,
    builtAt: Date.now(),
    fileCount: Object.keys(updatedFiles).length,
    files: updatedFiles,
  }
}

function getIndexExcludes(config: IndexingConfig): string[] {
  const cacheDir = config.cacheDir ?? '.codebuff-index'
  const normalizedCacheDir = sanitizeIndexCacheDir(cacheDir)
  return [
    ...(config.exclude ?? []),
    normalizedCacheDir,
    `${normalizedCacheDir}/`,
  ]
}

function getTopSymbols(scores: Record<string, number>, limit: number): string[] {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([sym]) => sym)
}

function extractImports(content: string): string[] {
  const imports: string[] = []
  const regex = new RegExp(IMPORT_REGEX.source, 'g')
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    const importPath = match[1]
    if (importPath && !imports.includes(importPath)) {
      imports.push(importPath)
    }
  }
  return imports.slice(0, 50)
}

function extractHeadings(content: string): string[] {
  const headings: string[] = []
  for (const line of content.split('\n')) {
    const m = line.match(/^#{1,6}\s+(.+)$/)
    if (m) headings.push(m[1].trim())
  }
  return headings
}
