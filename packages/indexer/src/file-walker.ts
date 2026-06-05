import * as fs from 'node:fs'
import * as path from 'node:path'

import ignore from 'ignore'

const DEFAULT_EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.output',
  'coverage',
  '.cache',
  '.codebuff-index',
  'tmp',
  '.tmp',
])

const MAX_FILE_SIZE = 500_000 // 500KB
const MAX_FILES = 20_000

export interface WalkedFile {
  absolutePath: string
  relativePath: string
  ext: string
  mtime: number
  size: number
}

export async function walkProject(
  projectRoot: string,
  extraExclude: string[] = [],
): Promise<WalkedFile[]> {
  const extraExcludeSet = new Set(extraExclude)
  const matcher = ignore()
    .add(loadIgnorePatterns(path.join(projectRoot, '.gitignore')))
    .add(loadIgnorePatterns(path.join(projectRoot, '.codebuffignore')))
    .add(extraExclude)

  const results: WalkedFile[] = []

  async function walk(dir: string): Promise<void> {
    if (results.length >= MAX_FILES) return
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (results.length >= MAX_FILES) break
      const abs = path.join(dir, entry.name)
      const rel = path.relative(projectRoot, abs)

      if (entry.isDirectory()) {
        if (DEFAULT_EXCLUDE_DIRS.has(entry.name) || extraExcludeSet.has(entry.name)) {
          continue
        }
        if (matcher.ignores(`${normalizeRelativePath(rel)}/`)) continue
        await walk(abs)
      } else if (entry.isFile()) {
        if (matcher.ignores(normalizeRelativePath(rel))) continue
        let stat: fs.Stats
        try {
          stat = await fs.promises.stat(abs)
        } catch {
          continue
        }
        if (stat.size > MAX_FILE_SIZE) continue
        const ext = path.extname(entry.name).toLowerCase()
        results.push({
          absolutePath: abs,
          relativePath: rel,
          ext,
          mtime: stat.mtimeMs,
          size: stat.size,
        })
      }
    }
  }

  await walk(projectRoot)
  return results
}

function loadIgnorePatterns(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
  } catch {
    return []
  }
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/')
}
