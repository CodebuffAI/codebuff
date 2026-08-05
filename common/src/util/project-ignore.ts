import * as ignore from 'ignore'

export const PROJECT_IGNORE_FILES = [
  '.gitignore',
  '.codebuffignore',
  '.manicodeignore',
] as const

export type DirIgnore = { base: string; ig: ignore.Ignore }

function normalizeRelativePath(filePath: string): string | null {
  const segments: string[] = []
  for (const segment of filePath.replaceAll('\\', '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) return null
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return segments.join('/') || null
}

function testChain(chain: DirIgnore[], candidate: string): boolean {
  let ignored = false
  for (const { base, ig } of chain) {
    if (base && !candidate.startsWith(`${base}/`)) continue
    const scoped = base ? candidate.slice(base.length + 1) : candidate
    if (!scoped) continue
    const result = ig.test(scoped)
    if (result.ignored) ignored = true
    else if (result.unignored) ignored = false
  }
  return ignored
}

export function isIgnoredByIgnoreChain(
  chain: DirIgnore[],
  filePath: string,
): boolean {
  const segments = filePath.split('/')
  for (let i = 0; i < segments.length - 1; i++) {
    if (testChain(chain, `${segments.slice(0, i + 1).join('/')}/`)) {
      return true
    }
  }
  return testChain(chain, filePath)
}

export function addIgnoreFileContents(
  ig: ignore.Ignore,
  contents: string,
  onInvalidPattern?: (pattern: string, error: unknown) => void,
): void {
  for (let line of contents.split('\n')) {
    line = line.trim()
    if (!line || line.startsWith('#')) continue
    try {
      ig.add(line)
    } catch (error: unknown) {
      // Match the local file-tree behavior: one invalid pattern must not make
      // the remaining valid project rules disappear.
      onInvalidPattern?.(line, error)
    }
  }
}

/**
 * Build a fail-closed-friendly ignore-file reader for filesystems whose read
 * errors do not reliably distinguish a missing file from an unreadable one.
 */
export function createProjectIgnoreFileReader(params: {
  listDirectory: (directory: string) => Promise<readonly string[]>
  readFile: (filePath: string) => Promise<string>
}): (filePath: string) => Promise<string | null> {
  const directoryEntries = new Map<string, Promise<Set<string>>>()

  return async (filePath) => {
    const separator = filePath.lastIndexOf('/')
    const directory = separator === -1 ? '' : filePath.slice(0, separator)
    const fileName = filePath.slice(separator + 1)

    let entries = directoryEntries.get(directory)
    if (!entries) {
      entries = params.listDirectory(directory).then((names) => new Set(names))
      directoryEntries.set(directory, entries)
    }
    if (!(await entries).has(fileName)) return null

    return params.readFile(filePath)
  }
}

/** Evaluate project-owned ignore files without requiring a native Git binary. */
export async function isProjectFileIgnored(params: {
  filePath: string
  readIgnoreFile: (filePath: string) => Promise<string | null>
}): Promise<boolean> {
  const filePath = normalizeRelativePath(params.filePath)
  if (!filePath) return true

  const parentSegments = filePath.split('/').slice(0, -1)
  const chain: DirIgnore[] = []
  for (let depth = 0; depth <= parentSegments.length; depth++) {
    const base = parentSegments.slice(0, depth).join('/')
    const ig = ignore.default()
    for (const ignoreFile of PROJECT_IGNORE_FILES) {
      const ignorePath = base ? `${base}/${ignoreFile}` : ignoreFile
      const contents = await params.readIgnoreFile(ignorePath)
      if (contents !== null) addIgnoreFileContents(ig, contents)
    }
    chain.push({ base, ig })
  }

  return isIgnoredByIgnoreChain(chain, filePath)
}
