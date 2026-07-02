import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { getFileTokenScores, SUPPORTED_CODE_EXTENSIONS } from '@codebuff/code-map'

import { walkProject } from './file-walker'
import { sanitizeIndexCacheDir } from './index-store'
import type {
  GraphWeights,
  IndexedFile,
  IndexEdge,
  IndexGraph,
  IndexingConfig,
  IndexNode,
  MetadataIndex,
  ParseDiagnostic,
} from './types'
import type { ParsedFileTokens } from '@codebuff/code-map'

const CODE_EXTENSIONS = new Set(SUPPORTED_CODE_EXTENSIONS)

const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.rst'])
const CONFIG_EXTENSIONS = new Set(['.json', '.jsonc', '.yaml', '.yml', '.toml'])

/** Historical hardcoded graph edge weights — the ranking baseline. */
export const DEFAULT_GRAPH_WEIGHTS: Required<GraphWeights> = {
  defines: 1,
  imports: 0.7,
  references: 0.9,
  containsHeading: 0.8,
  mentions: 0.6,
  calls: 1.1,
}

/** Merge partial user graph weights over the historical defaults (undefined-safe). */
export function resolveGraphWeights(
  weights?: GraphWeights,
): Required<GraphWeights> {
  const resolved: Required<GraphWeights> = { ...DEFAULT_GRAPH_WEIGHTS }
  if (weights) {
    for (const key of Object.keys(DEFAULT_GRAPH_WEIGHTS) as (keyof GraphWeights)[]) {
      const value = weights[key]
      if (typeof value === 'number' && Number.isFinite(value)) {
        resolved[key] = value
      }
    }
  }
  return resolved
}

// Captures the module specifier from: `import … from 'x'`, `export … from 'x'`
// (re-exports), `require('x')` / `import('x')` (dynamic), and `import 'x'`
// (side-effect). The {0,500} bound avoids catastrophic backtracking.
const IMPORT_REGEX =
  /(?:\b(?:import|export)\b[\s\S]{0,500}?\bfrom\s+['"]([^'"]+)['"])|(?:\b(?:require|import)\s*\(\s*['"]([^'"]+)['"])|(?:\bimport\s+['"]([^'"]+)['"])/g
const MARKDOWN_LINK_REGEX = /\[[^\]]+\]\(([^)]+)\)/g

/**
 * In-process cache of raw tree-sitter parse output per file, keyed by project
 * root. Lets incremental rebuilds re-parse ONLY changed files instead of the
 * whole project (the cross-file call graph is recomputed cheaply from the
 * merged set). Lost on process restart — the first build of a session is a
 * full parse, which is correct, just not free.
 */
const parsedCacheByRoot = new Map<string, Record<string, ParsedFileTokens>>()

/** Cache of resolved tsconfig path aliases per project root. */
const tsAliasCacheByRoot = new Map<string, TsAliasMap>()

/**
 * Upper bound on the number of distinct project roots whose parse/alias
 * caches we retain in-process. Eviction is FIFO (Map insertion order). A
 * long-lived process that indexes many distinct roots can't grow these
 * without bound; the oldest root's cache is dropped on overflow.
 */
const MAX_INDEXED_PROJECT_ROOTS = 8

function evictOldestRootCacheIfNeeded(): void {
  if (parsedCacheByRoot.size >= MAX_INDEXED_PROJECT_ROOTS) {
    const oldestRoot = parsedCacheByRoot.keys().next().value
    if (oldestRoot !== undefined) {
      parsedCacheByRoot.delete(oldestRoot)
      tsAliasCacheByRoot.delete(oldestRoot)
    }
  }
}

function getParsedCache(projectRoot: string): Record<string, ParsedFileTokens> {
  let cache = parsedCacheByRoot.get(projectRoot)
  if (!cache) {
    evictOldestRootCacheIfNeeded()
    cache = {}
    parsedCacheByRoot.set(projectRoot, cache)
  }
  return cache
}

export async function buildMetadataIndex(
  projectRoot: string,
  config: IndexingConfig = {},
): Promise<MetadataIndex> {
  const files = await walkProject(projectRoot, getIndexExcludes(config))

  const codeFilePaths = files
    .filter((f) => CODE_EXTENSIONS.has(f.ext))
    .map((f) => f.relativePath)

  let tokenScores: Record<string, Record<string, number>> = {}
  let tokenCallers: Record<string, Record<string, string[]>> = {}
  let parseDiagnostics: ParseDiagnostic[] = []
  if (codeFilePaths.length > 0) {
    try {
      const data = await getFileTokenScores(projectRoot, codeFilePaths)
      tokenScores = data.tokenScores
      tokenCallers = data.tokenCallers
      parseDiagnostics = data.diagnostics
      parsedCacheByRoot.set(projectRoot, data.parsed)
    } catch (error) {
      parseDiagnostics = [createParseDiagnostic(projectRoot, error)]
    }
  }

  const indexedFiles: Record<string, IndexedFile> = {}

  for (const file of files) {
    const indexed = await indexWalkedFile({
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
      mtime: file.mtime,
      size: file.size,
      ext: file.ext,
      tokenScores: tokenScores[file.relativePath] ?? {},
    })
    if (indexed) indexedFiles[file.relativePath] = indexed
  }

  return createMetadataIndex(
    projectRoot,
    indexedFiles,
    tokenCallers,
    config.weights?.graph,
    parseDiagnostics,
  )
}

export async function updateMetadataIndex(
  existing: MetadataIndex,
  projectRoot: string,
  config: IndexingConfig = {},
): Promise<MetadataIndex> {
  const files = await walkProject(projectRoot, getIndexExcludes(config))
  const currentByPath = new Map(files.map((f) => [f.relativePath, f]))
  const deletedPaths = new Set(Object.keys(existing.files))

  for (const f of files) {
    deletedPaths.delete(f.relativePath)
  }

  const hashByPath = new Map<string, string>()
  const hashReadFailedPaths = new Set<string>()
  const changedFiles: typeof files = []
  const updatedFiles: Record<string, IndexedFile> = { ...existing.files }
  let metadataOnlyChange = false

  for (const file of files) {
    const indexed = existing.files[file.relativePath]
    let hash: string | undefined
    try {
      hash = await hashFile(file.absolutePath)
    } catch {
      hashReadFailedPaths.add(file.relativePath)
      changedFiles.push(file)
      continue
    }
    hashByPath.set(file.relativePath, hash)
    if (!indexed || indexed.hash !== hash) {
      changedFiles.push(file)
    } else if (indexed.mtime !== file.mtime || indexed.size !== file.size) {
      updatedFiles[file.relativePath] = {
        ...indexed,
        mtime: file.mtime,
        size: file.size,
        hash,
      }
      metadataOnlyChange = true
    }
  }

  if (changedFiles.length === 0 && deletedPaths.size === 0) {
    return {
      ...existing,
      builtAt: Date.now(),
      files: metadataOnlyChange ? updatedFiles : existing.files,
      graph: buildGraph(
        metadataOnlyChange ? updatedFiles : existing.files,
        extractTokenCallers(existing.graph),
        loadTsAliases(projectRoot),
        resolveGraphWeights(config.weights?.graph),
      ),
    }
  }

  const allCodeFilePaths = files
    .filter((f) => CODE_EXTENSIONS.has(f.ext) && !hashReadFailedPaths.has(f.relativePath))
    .map((f) => f.relativePath)

  // Only changed code files need re-parsing; reuse cached parse output for the
  // rest. The global token scores + call graph are then recomputed from the
  // merged set (cheap, no tree-sitter). This avoids a full project re-parse on
  // every incremental update (e.g. after each agent edit).
  const changedPathSet = new Set(changedFiles.map((f) => f.relativePath))
  const previousCache = getParsedCache(projectRoot)
  const reuseParsed: Record<string, ParsedFileTokens> = {}
  for (const codePath of allCodeFilePaths) {
    if (!changedPathSet.has(codePath) && previousCache[codePath]) {
      reuseParsed[codePath] = previousCache[codePath]
    }
  }

  let tokenScores: Record<string, Record<string, number>> = {}
  let tokenCallers: Record<string, Record<string, string[]>> = {}
  let parseDiagnostics: ParseDiagnostic[] = []
  if (allCodeFilePaths.length > 0) {
    try {
      const data = await getFileTokenScores(
        projectRoot,
        allCodeFilePaths,
        undefined,
        reuseParsed,
      )
      tokenScores = data.tokenScores
      tokenCallers = data.tokenCallers
      parseDiagnostics = data.diagnostics
      parsedCacheByRoot.set(projectRoot, data.parsed)
    } catch (error) {
      parseDiagnostics = [createParseDiagnostic(projectRoot, error)]
    }
  }

  for (const deletedPath of deletedPaths) {
    delete updatedFiles[deletedPath]
  }

  for (const file of changedFiles) {
    const indexed = await indexWalkedFile({
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
      mtime: file.mtime,
      size: file.size,
      ext: file.ext,
      hash: hashByPath.get(file.relativePath),
      tokenScores: tokenScores[file.relativePath] ?? {},
    })
    if (indexed) {
      updatedFiles[file.relativePath] = indexed
    } else {
      delete updatedFiles[file.relativePath]
    }
  }

  for (const [filePath, scores] of Object.entries(tokenScores)) {
    const file = currentByPath.get(filePath)
    const indexed = updatedFiles[filePath]
    if (!file || !indexed) continue
    updatedFiles[filePath] = {
      ...indexed,
      symbols: getTopSymbols(scores, 30),
    }
  }

  return createMetadataIndex(
    projectRoot,
    updatedFiles,
    tokenCallers,
    config.weights?.graph,
    parseDiagnostics,
  )
}

async function indexWalkedFile(params: {
  absolutePath: string
  relativePath: string
  mtime: number
  size: number
  ext: string
  hash?: string
  tokenScores: Record<string, number>
}): Promise<IndexedFile | null> {
  let content = ''
  try {
    content = await fs.promises.readFile(params.absolutePath, 'utf8')
  } catch {
    return null
  }

  const symbols = getTopSymbols(params.tokenScores, 30)
  const imports = extractImports(content)
  const headings = DOC_EXTENSIONS.has(params.ext) ? extractHeadings(content) : []
  const configConcepts = extractConfigConcepts(params.relativePath, content)
  const baseConcepts = DOC_EXTENSIONS.has(params.ext)
    ? extractConcepts(content, headings)
    : CODE_EXTENSIONS.has(params.ext)
      ? extractCodeComments(content)
      : CONFIG_EXTENSIONS.has(params.ext)
        ? configConcepts
        : []
  const concepts = mergeConcepts(baseConcepts, configConcepts)

  return {
    path: params.relativePath,
    mtime: params.mtime,
    size: params.size,
    hash: params.hash ?? hashContent(content),
    ext: params.ext,
    symbols,
    imports,
    headings,
    concepts,
  }
}

function createMetadataIndex(
  projectRoot: string,
  files: Record<string, IndexedFile>,
  tokenCallers: Record<string, Record<string, string[]>>,
  graphWeights?: GraphWeights,
  parseDiagnostics: ParseDiagnostic[] = [],
): MetadataIndex {
  const aliases = loadTsAliases(projectRoot)
  return {
    version: '2',
    projectRoot,
    builtAt: Date.now(),
    fileCount: Object.keys(files).length,
    files,
    graph: buildGraph(files, tokenCallers, aliases, resolveGraphWeights(graphWeights)),
    parseDiagnostics,
  }
}

function createParseDiagnostic(projectRoot: string, error: unknown): ParseDiagnostic {
  return {
    filePath: projectRoot,
    stage: 'parse',
    message: error instanceof Error ? error.message : String(error),
  }
}

function buildGraph(
  files: Record<string, IndexedFile>,
  tokenCallers: Record<string, Record<string, string[]>>,
  aliases: TsAliasMap | undefined,
  weights: Required<GraphWeights>,
): IndexGraph {
  const nodes: Record<string, IndexNode> = {}
  const edges: IndexEdge[] = []

  for (const file of Object.values(files)) {
    const fileId = fileNodeId(file.path)
    nodes[fileId] = { id: fileId, type: 'file', label: file.path, path: file.path }

    for (const symbol of file.symbols.slice(0, 30)) {
      const symbolId = symbolNodeId(symbol)
      nodes[symbolId] ??= { id: symbolId, type: 'symbol', label: symbol }
      edges.push({ from: fileId, to: symbolId, type: 'defines', weight: weights.defines, label: symbol })
    }

    for (const importPath of file.imports.slice(0, 50)) {
      const importId = importNodeId(importPath)
      nodes[importId] ??= { id: importId, type: 'import', label: importPath }
      edges.push({ from: fileId, to: importId, type: 'imports', weight: weights.imports, label: importPath })
      const resolved = resolveImportToFile(file.path, importPath, files, aliases)
      if (resolved) {
        edges.push({
          from: fileId,
          to: fileNodeId(resolved),
          type: 'references',
          weight: weights.references,
          label: importPath,
        })
      }
    }

    for (const heading of file.headings.slice(0, 40)) {
      const headingId = headingNodeId(file.path, heading)
      nodes[headingId] = { id: headingId, type: 'heading', label: heading, path: file.path }
      edges.push({ from: fileId, to: headingId, type: 'contains_heading', weight: weights.containsHeading, label: heading })
    }

    for (const concept of file.concepts.slice(0, 80)) {
      const conceptId = conceptNodeId(concept)
      nodes[conceptId] ??= { id: conceptId, type: 'concept', label: concept }
      edges.push({ from: fileId, to: conceptId, type: 'mentions', weight: weights.mentions, label: concept })
    }
  }

  for (const [definingFile, callersByToken] of Object.entries(tokenCallers)) {
    if (!files[definingFile]) continue
    for (const [token, callers] of Object.entries(callersByToken)) {
      for (const callerFile of callers) {
        if (!files[callerFile]) continue
        edges.push({
          from: fileNodeId(callerFile),
          to: fileNodeId(definingFile),
          type: 'calls',
          weight: weights.calls,
          label: token,
        })
      }
    }
  }

  return { nodes, edges: dedupeEdges(edges) }
}

function extractTokenCallers(graph: IndexGraph): Record<string, Record<string, string[]>> {
  const tokenCallers: Record<string, Record<string, string[]>> = {}
  for (const edge of graph.edges) {
    if (edge.type !== 'calls') continue
    const callerPath = graph.nodes[edge.from]?.path
    const definingPath = graph.nodes[edge.to]?.path
    if (!callerPath || !definingPath || !edge.label) continue
    tokenCallers[definingPath] ??= {}
    tokenCallers[definingPath][edge.label] ??= []
    tokenCallers[definingPath][edge.label].push(callerPath)
  }
  return tokenCallers
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
    const importPath = match[1] ?? match[2] ?? match[3]
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

function extractConcepts(content: string, headings: string[]): string[] {
  const concepts = new Set<string>()
  for (const heading of headings) {
    for (const token of conceptTokens(heading)) concepts.add(token)
    const normalized = normalizeConcept(heading)
    if (normalized) concepts.add(normalized)
  }

  let match: RegExpExecArray | null
  const regex = new RegExp(MARKDOWN_LINK_REGEX.source, 'g')
  while ((match = regex.exec(content)) !== null) {
    const href = match[1]
    if (!href) continue
    const base = href.split('#')[0]?.split('?')[0] ?? href
    const label = path.basename(base).replace(/\.[a-z0-9]+$/i, '')
    for (const token of conceptTokens(label)) concepts.add(token)
  }

  return Array.from(concepts).filter(Boolean).slice(0, 120)
}

function conceptTokens(text: string): string[] {
  return normalizeConcept(text)
    .split(/[\s\-_./]+/)
    .filter((token) => token.length >= 3)
}

function extractConfigConcepts(filePath: string, content: string): string[] {
  if (filePath.endsWith('package.json')) {
    return extractPackageJsonConcepts(content)
  }
  if (isCiWorkflowPath(filePath)) {
    return extractCiWorkflowConcepts(content)
  }
  if (isTaskRunnerPath(filePath)) {
    return ['command configuration', 'task runner', ...conceptTokens(content).slice(0, 80)]
  }
  return []
}

function mergeConcepts(primary: string[], secondary: string[]): string[] {
  if (secondary.length === 0) return primary
  return Array.from(new Set([...primary, ...secondary])).slice(0, 160)
}

function extractPackageJsonConcepts(content: string): string[] {
  const concepts = new Set<string>(['package manifest', 'package scripts', 'command configuration'])
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return Array.from(concepts)
  }
  if (!parsed || typeof parsed !== 'object' || !('scripts' in parsed)) {
    return Array.from(concepts)
  }

  const scripts = (parsed as { scripts?: unknown }).scripts
  if (!scripts || typeof scripts !== 'object') return Array.from(concepts)

  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command !== 'string') continue
    concepts.add(name)
    concepts.add(`script ${name}`)
    concepts.add(`script:${name}=${command}`)
    for (const token of conceptTokens(`${name} ${command}`)) concepts.add(token)
  }
  return Array.from(concepts).slice(0, 160)
}

function extractCiWorkflowConcepts(content: string): string[] {
  const concepts = new Set<string>([
    'ci workflow',
    'github actions',
    'validation suite',
    'command configuration',
  ])
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (/^(?:-\s*)?(run|uses|name):\s+/i.test(trimmed)) {
      const isRunCommand = /^(?:-\s*)?run:/i.test(trimmed)
      concepts.add(
        isRunCommand
          ? (trimmed.startsWith('run:') ? trimmed : `run:${trimmed}`)
          : trimmed,
      )
      for (const token of conceptTokens(trimmed)) concepts.add(token)
    }
  }
  return Array.from(concepts).slice(0, 160)
}

function isCiWorkflowPath(filePath: string): boolean {
  return filePath.startsWith('.github/workflows/') || filePath.includes('/.github/workflows/')
}

function isTaskRunnerPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase().replace(/\\/g, '/')
  return normalized.endsWith('makefile') ||
    normalized.endsWith('justfile') ||
    normalized.endsWith('turbo.json') ||
    normalized.endsWith('nx.json') ||
    normalized.endsWith('gulpfile.js') ||
    normalized.endsWith('gruntfile.js')
}

/**
 * Extract concept tokens from code comments/docstrings so queries matching
 * phrases in commentary (not just symbol names) have recall. Handles `//` and
 * `/* *\/` (C-family), `#` line comments (Python/Ruby/Go shebang-style), and
 * triple-quoted docstrings. Capped to bound index growth.
 */
function extractCodeComments(content: string): string[] {
  const concepts = new Set<string>()
  const add = (text: string) => {
    for (const token of conceptTokens(text)) concepts.add(token)
  }

  // Block comments and triple-quoted docstrings.
  const blockRegex = /\/\*[\s\S]*?\*\/|"""[\s\S]*?"""|'''[\s\S]*?'''/g
  let match: RegExpExecArray | null
  while ((match = blockRegex.exec(content)) !== null && concepts.size < 200) {
    add(match[0])
  }

  // Line comments: `// ...` anywhere, or a line that (after trimming) starts
  // with `#` (avoids matching TS private fields like `this.#x`).
  for (const line of content.split('\n')) {
    if (concepts.size >= 200) break
    const slashIdx = line.indexOf('//')
    if (slashIdx >= 0) add(line.slice(slashIdx + 2))
    const trimmed = line.trimStart()
    if (trimmed.startsWith('#')) add(trimmed.slice(1))
  }

  return Array.from(concepts).filter(Boolean).slice(0, 120)
}

function normalizeConcept(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

async function hashFile(filePath: string): Promise<string> {
  return hashContent(await fs.promises.readFile(filePath, 'utf8'))
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function fileNodeId(filePath: string): string {
  return `file:${filePath}`
}

function symbolNodeId(symbol: string): string {
  return `symbol:${symbol}`
}

function importNodeId(importPath: string): string {
  return `import:${importPath}`
}

function headingNodeId(filePath: string, heading: string): string {
  return `heading:${filePath}#${heading}`
}

function conceptNodeId(concept: string): string {
  return `concept:${concept}`
}

export type TsAliasMap = Record<string, string[]>

function stripJsonComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1')
}

/**
 * Load tsconfig `compilerOptions.paths` aliases (following `extends`), so the
 * import graph can resolve workspace-internal aliases like "@codebuff/common/*".
 * Tolerant: comments/trailing commas are stripped, and any failure yields no
 * aliases (relative-import resolution still works). Cached per root.
 */
function loadTsAliases(projectRoot: string): TsAliasMap {
  const cached = tsAliasCacheByRoot.get(projectRoot)
  if (cached) return cached

  const aliases: TsAliasMap = {}
  try {
    let configPath: string = path.join(projectRoot, 'tsconfig.json')
    const visited = new Set<string>()
    while (configPath && !visited.has(configPath) && fs.existsSync(configPath)) {
      visited.add(configPath)
      const raw = JSON.parse(
        stripJsonComments(fs.readFileSync(configPath, 'utf8')),
      )
      const paths = raw?.compilerOptions?.paths
      if (paths && typeof paths === 'object') {
        for (const [key, value] of Object.entries(paths)) {
          // Closest config wins; do not let a base config override.
          if (!(key in aliases) && Array.isArray(value)) {
            aliases[key] = (value as string[]).map((t) =>
              t.replace(/^\.\//, '').replace(/\\/g, '/'),
            )
          }
        }
      }
      const ext = raw?.extends
      configPath =
        typeof ext === 'string'
          ? path.resolve(path.dirname(configPath), ext)
          : ''
    }
  } catch {
    // No aliases on parse/read failure.
  }

  if (!tsAliasCacheByRoot.has(projectRoot)) {
    evictOldestRootCacheIfNeeded()
  }
  tsAliasCacheByRoot.set(projectRoot, aliases)
  return aliases
}

function resolveModuleCandidates(
  base: string,
  files: Record<string, IndexedFile>,
): string | null {
  const normalized = base.replace(/^\.\//, '')
  const candidates = [
    normalized,
    `${normalized}.ts`,
    `${normalized}.tsx`,
    `${normalized}.js`,
    `${normalized}.jsx`,
    `${normalized}.mjs`,
    `${normalized}.cjs`,
    `${normalized}/index.ts`,
    `${normalized}/index.tsx`,
    `${normalized}/index.js`,
    `${normalized}/index.jsx`,
  ]
  return candidates.find((candidate) => files[candidate]) ?? null
}

/**
 * Resolve a non-relative import via tsconfig `paths` aliases (e.g.
 * "@codebuff/common/util/x" -> "common/src/util/x"). Supports both wildcard
 * (`@scope/*`) and exact (`@scope/sdk`) patterns. Targets are interpreted
 * relative to the project root (baseUrl="." in this repo).
 */
function resolveAliasImport(
  importPath: string,
  aliases: TsAliasMap,
  files: Record<string, IndexedFile>,
): string | null {
  for (const [pattern, targets] of Object.entries(aliases)) {
    const starIndex = pattern.indexOf('*')
    if (starIndex >= 0) {
      const prefix = pattern.slice(0, starIndex)
      const suffix = pattern.slice(starIndex + 1)
      if (
        importPath.startsWith(prefix) &&
        importPath.endsWith(suffix) &&
        importPath.length >= prefix.length + suffix.length
      ) {
        const middle = importPath.slice(
          prefix.length,
          importPath.length - suffix.length,
        )
        for (const target of targets) {
          const base = target.replace('*', middle)
          const resolved = resolveModuleCandidates(base, files)
          if (resolved) return resolved
        }
      }
    } else if (importPath === pattern) {
      for (const target of targets) {
        const resolved = resolveModuleCandidates(target, files)
        if (resolved) return resolved
      }
    }
  }
  return null
}

function resolveImportToFile(
  fromFilePath: string,
  importPath: string,
  files: Record<string, IndexedFile>,
  aliases?: TsAliasMap,
): string | null {
  if (importPath.startsWith('.')) {
    const fromDir = path.posix.dirname(fromFilePath.replace(/\\/g, '/'))
    const normalizedBase = path.posix.normalize(
      path.posix.join(fromDir, importPath),
    )
    return resolveModuleCandidates(normalizedBase, files)
  }
  // Non-relative: try tsconfig path aliases (workspace-internal imports).
  if (aliases) {
    return resolveAliasImport(importPath, aliases, files)
  }
  return null
}

function dedupeEdges(edges: IndexEdge[]): IndexEdge[] {
  const seen = new Set<string>()
  const deduped: IndexEdge[] = []
  for (const edge of edges) {
    const key = `${edge.from}\0${edge.to}\0${edge.type}\0${edge.label ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(edge)
  }
  return deduped
}
