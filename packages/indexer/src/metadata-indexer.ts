import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {
  getFileTokenScores,
  SUPPORTED_CODE_EXTENSIONS,
} from '@codebuff/code-map'

import { BINARY_EXTENSIONS, walkProjectDetailed } from './file-walker'
import {
  buildGuidToPathMap,
  extractAssetRefs,
  resolveGuidRef,
} from './asset-refs'
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
    for (const key of Object.keys(
      DEFAULT_GRAPH_WEIGHTS,
    ) as (keyof GraphWeights)[]) {
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
  tsAliasCacheByRoot.delete(projectRoot)
  const walked = await walkProjectDetailed(
    projectRoot,
    getIndexExcludes(config),
    config.maxFiles,
  )
  const files = walked.files

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

  const index = createMetadataIndex(
    projectRoot,
    indexedFiles,
    tokenCallers,
    config.weights?.graph,
    parseDiagnostics,
  )
  index.coverage = {
    truncated: walked.truncated,
    maxFiles: walked.maxFiles,
    skippedFiles: walked.skippedFiles,
    skippedPrefixes: walked.skippedPrefixes,
  }
  return index
}

export async function updateMetadataIndex(
  existing: MetadataIndex,
  projectRoot: string,
  config: IndexingConfig = {},
): Promise<MetadataIndex> {
  tsAliasCacheByRoot.delete(projectRoot)
  const walked = await walkProjectDetailed(
    projectRoot,
    getIndexExcludes(config),
    config.maxFiles,
  )
  const files = walked.files
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
      coverage: {
        truncated: walked.truncated,
        maxFiles: walked.maxFiles,
        skippedFiles: walked.skippedFiles,
        skippedPrefixes: walked.skippedPrefixes,
      },
    }
  }

  const allCodeFilePaths = files
    .filter(
      (f) =>
        CODE_EXTENSIONS.has(f.ext) && !hashReadFailedPaths.has(f.relativePath),
    )
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
  let parserDegraded = false
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
      parserDegraded = true
    }
  }

  if (parserDegraded) {
    return {
      ...existing,
      builtAt: Date.now(),
      parseDiagnostics,
      coverage: {
        truncated: walked.truncated,
        maxFiles: walked.maxFiles,
        skippedFiles: walked.skippedFiles,
        skippedPrefixes: walked.skippedPrefixes,
      },
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

  const index = createMetadataIndex(
    projectRoot,
    updatedFiles,
    tokenCallers,
    config.weights?.graph,
    parseDiagnostics,
  )
  index.coverage = {
    truncated: walked.truncated,
    maxFiles: walked.maxFiles,
    skippedFiles: walked.skippedFiles,
    skippedPrefixes: walked.skippedPrefixes,
  }
  return index
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
  // Skip binary files entirely — they cannot be parsed as UTF-8 text and
  // reading them would corrupt the index with garbage imports/symbols.
  // The file-walker already skips these, but this is a defense-in-depth
  // guard in case files are added through a different path.
  if (BINARY_EXTENSIONS.has(params.ext)) {
    return null
  }
  let content = ''
  try {
    content = await fs.promises.readFile(params.absolutePath, 'utf8')
  } catch {
    return null
  }

  const symbols = getTopSymbols(params.tokenScores, 30)
  const imports = extractImports(content, params.ext)
  const headings = DOC_EXTENSIONS.has(params.ext)
    ? extractHeadings(content)
    : []
  const configConcepts = extractConfigConcepts(params.relativePath, content)
  const baseConcepts = DOC_EXTENSIONS.has(params.ext)
    ? extractConcepts(content, headings)
    : CODE_EXTENSIONS.has(params.ext)
      ? extractCodeComments(content)
      : CONFIG_EXTENSIONS.has(params.ext)
        ? configConcepts
        : []
  const concepts = mergeConcepts(baseConcepts, configConcepts)
  const contentSample = content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .slice(0, 120)
    .join('\n')
    .slice(0, 4_000)

  // Extract asset references from game engine text files (Unity .meta/.prefab/.unity,
  // Godot .tscn/.tres, Unreal .uproject, Bevy configs). Returns [] for non-asset files.
  const assetRefs = extractAssetRefs(content, params.ext, params.relativePath)

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
    contentSample,
    ...(assetRefs.length > 0 ? { assetRefs } : {}),
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
    graph: buildGraph(
      files,
      tokenCallers,
      aliases,
      resolveGraphWeights(graphWeights),
    ),
    parseDiagnostics,
  }
}

function createParseDiagnostic(
  projectRoot: string,
  error: unknown,
): ParseDiagnostic {
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

  // Build a GUID → asset-path map from all indexed .meta files so Unity guid
  // references in .prefab/.unity files can be resolved to actual file paths.
  const guidToPathMap = buildGuidToPathMap(files)

  for (const file of Object.values(files)) {
    const fileId = fileNodeId(file.path)
    nodes[fileId] = {
      id: fileId,
      type: 'file',
      label: file.path,
      path: file.path,
    }

    for (const symbol of file.symbols.slice(0, 30)) {
      const symbolId = symbolNodeId(symbol)
      nodes[symbolId] ??= { id: symbolId, type: 'symbol', label: symbol }
      edges.push({
        from: fileId,
        to: symbolId,
        type: 'defines',
        weight: weights.defines,
        label: symbol,
      })
    }

    for (const importPath of file.imports.slice(0, 50)) {
      const importId = importNodeId(importPath)
      nodes[importId] ??= { id: importId, type: 'import', label: importPath }
      edges.push({
        from: fileId,
        to: importId,
        type: 'imports',
        weight: weights.imports,
        label: importPath,
      })
      const resolved = resolveImportToFile(
        file.path,
        file.ext,
        importPath,
        files,
        aliases,
      )
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
      nodes[headingId] = {
        id: headingId,
        type: 'heading',
        label: heading,
        path: file.path,
      }
      edges.push({
        from: fileId,
        to: headingId,
        type: 'contains_heading',
        weight: weights.containsHeading,
        label: heading,
      })
    }

    for (const concept of file.concepts.slice(0, 80)) {
      const conceptId = conceptNodeId(concept)
      nodes[conceptId] ??= { id: conceptId, type: 'concept', label: concept }
      edges.push({
        from: fileId,
        to: conceptId,
        type: 'mentions',
        weight: weights.mentions,
        label: concept,
      })
    }

    // Create graph edges from asset references (game-engine file → referenced asset).
    // Only resolved refs (GUID → path via guidToPathMap, or res:// → project path)
    // create file→file edges. Unresolved refs are informational only.
    if (file.assetRefs) {
      for (const ref of file.assetRefs.slice(0, 80)) {
        let resolvedPath: string | null = ref.resolvedPath

        // For Unity guid refs, resolve via the GUID → path map.
        // .meta files already have resolvedPath set (self-identifying); only
        // .prefab/.unity refs need lookup.
        if (ref.refType === 'guid' && !resolvedPath) {
          resolvedPath = resolveGuidRef(ref.rawRef, guidToPathMap)
        }

        // Try the resolved path directly. If the asset itself is a binary
        // file (e.g. .png) it won't be in the index — fall back to the .meta
        // file (which IS indexed as text YAML) so the reference edge still
        // connects to a real graph node.
        if (resolvedPath) {
          let edgeTarget: string | null = null
          if (files[resolvedPath]) {
            edgeTarget = resolvedPath
          } else if (files[`${resolvedPath}.meta`]) {
            edgeTarget = `${resolvedPath}.meta`
          }
          if (edgeTarget) {
            edges.push({
              from: fileId,
              to: fileNodeId(edgeTarget),
              type: 'references',
              weight: weights.references,
              label: ref.rawRef,
            })
          }
        }
      }
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

function extractTokenCallers(
  graph: IndexGraph,
): Record<string, Record<string, string[]>> {
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

function getTopSymbols(
  scores: Record<string, number>,
  limit: number,
): string[] {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([sym]) => sym)
}

function extractImports(content: string, extension: string): string[] {
  const imports = new Set<string>()
  const addMatches = (
    regex: RegExp,
    select: (match: RegExpExecArray) => string | undefined,
  ) => {
    let match: RegExpExecArray | null
    while ((match = regex.exec(content)) !== null && imports.size < 50) {
      const importPath = select(match)?.trim()
      if (importPath) imports.add(importPath)
    }
  }

  if (
    ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'].includes(
      extension,
    )
  ) {
    addMatches(
      new RegExp(IMPORT_REGEX.source, 'g'),
      (match) => match[1] ?? match[2] ?? match[3],
    )
  } else if (['.py', '.pyi'].includes(extension)) {
    addMatches(/^\s*from\s+([.\w]+)\s+import\b/gm, (match) => match[1])
    addMatches(/^\s*import\s+([\w.]+)/gm, (match) => match[1])
  } else if (extension === '.rs') {
    addMatches(/^\s*(?:pub\s+)?(?:use|mod)\s+([\w:]+)/gm, (match) => match[1])
  } else if (extension === '.go') {
    addMatches(
      /^\s*import\s+(?:[\w.]+\s+)?["`]([^"`]+)["`]/gm,
      (match) => match[1],
    )
    addMatches(/\bimport\s*\(([\s\S]*?)\)/gm, (blockMatch) => {
      for (const line of (blockMatch[1] ?? '').split(/\r?\n/)) {
        const item = line.match(
          /^\s*(?:[\w.]+\s+)?["`]([^"`]+)["`]\s*(?:\/\/.*)?$/,
        )
        if (item?.[1]) imports.add(item[1])
      }
      return undefined
    })
  } else if (['.java', '.kt', '.kts'].includes(extension)) {
    addMatches(
      /^\s*import\s+(?:static\s+)?([\w.]+)(?:\.\*)?\s*;?\s*$/gm,
      (match) => match[1],
    )
  } else if (
    ['.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx'].includes(
      extension,
    )
  ) {
    addMatches(/^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm, (match) => match[1])
  } else if (extension === '.cs') {
    addMatches(
      /^\s*(?:global\s+)?using\s+(?:[\w]+\s*=\s*)?([\w.]+)\s*;/gm,
      (match) => match[1],
    )
  } else if (extension === '.rb') {
    addMatches(
      /^\s*require(?:_relative)?\s*[('" ]+([^'"\s)]+)/gm,
      (match) => match[1],
    )
  } else if (extension === '.php') {
    addMatches(/^\s*use\s+([\w\\]+)/gm, (match) =>
      match[1]?.replace(/\\/g, '/'),
    )
    addMatches(
      /\b(?:require|require_once|include|include_once)\s*\(?\s*['"]([^'"]+)/g,
      (match) => match[1],
    )
  } else if (extension === '.swift') {
    addMatches(/^\s*import\s+(?:\w+\s+)?([\w.]+)/gm, (match) => match[1])
  } else if (extension === '.gd') {
    addMatches(
      /\b(?:preload|load)\s*\(\s*["'](?:res:\/\/)?([^"']+)/g,
      (match) => match[1],
    )
  }

  return Array.from(imports)
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
  const languageManifestConcepts = extractLanguageManifestConcepts(filePath)
  if (languageManifestConcepts.length > 0) {
    return mergeConcepts(languageManifestConcepts, conceptTokens(content))
  }
  if (isCiWorkflowPath(filePath)) {
    return extractCiWorkflowConcepts(content)
  }
  if (isTaskRunnerPath(filePath)) {
    return [
      'command configuration',
      'task runner',
      ...conceptTokens(content).slice(0, 80),
    ]
  }
  return []
}

function extractLanguageManifestConcepts(filePath: string): string[] {
  const normalized = filePath.toLowerCase().replace(/\\/g, '/')
  const baseName = path.posix.basename(normalized)
  const conceptsByManifest: Record<string, string[]> = {
    'cargo.toml': [
      'rust manifest',
      'cargo check',
      'cargo test',
      'cargo clippy',
      'cargo fmt',
    ],
    'go.mod': ['go module', 'go test ./...', 'go vet ./...', 'gofmt'],
    'pyproject.toml': [
      'python manifest',
      'pytest',
      'ruff check',
      'mypy',
      'pyright',
    ],
    'requirements.txt': ['python dependencies', 'pytest', 'ruff check'],
    'pom.xml': ['java manifest', 'maven', 'mvn test', 'mvn verify'],
    'build.gradle': ['gradle build', 'gradle test', 'java manifest'],
    'build.gradle.kts': ['gradle build', 'gradle test', 'kotlin manifest'],
    'composer.json': [
      'php manifest',
      'composer test',
      'phpunit',
      'phpstan',
      'psalm',
    ],
    'package.swift': ['swift package', 'swift build', 'swift test'],
    gemfile: ['ruby dependencies', 'bundle exec rspec', 'bundle exec rubocop'],
    'project.godot': [
      'godot project',
      'godot headless validation',
      'godot test',
    ],
    'cmakelists.txt': ['cmake project', 'cmake build', 'ctest', 'clang tidy'],
  }
  if (conceptsByManifest[baseName]) return conceptsByManifest[baseName]
  if (baseName.endsWith('.csproj') || baseName.endsWith('.sln')) {
    return ['dotnet project', 'dotnet build', 'dotnet test', 'dotnet format']
  }
  return []
}

function mergeConcepts(primary: string[], secondary: string[]): string[] {
  if (secondary.length === 0) return primary
  return Array.from(new Set([...primary, ...secondary])).slice(0, 160)
}

function extractPackageJsonConcepts(content: string): string[] {
  const concepts = new Set<string>([
    'package manifest',
    'package scripts',
    'command configuration',
  ])
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
          ? trimmed.startsWith('run:')
            ? trimmed
            : `run:${trimmed}`
          : trimmed,
      )
      for (const token of conceptTokens(trimmed)) concepts.add(token)
    }
  }
  return Array.from(concepts).slice(0, 160)
}

function isCiWorkflowPath(filePath: string): boolean {
  return (
    filePath.startsWith('.github/workflows/') ||
    filePath.includes('/.github/workflows/')
  )
}

function isTaskRunnerPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase().replace(/\\/g, '/')
  return (
    normalized.endsWith('makefile') ||
    normalized.endsWith('justfile') ||
    normalized.endsWith('turbo.json') ||
    normalized.endsWith('nx.json') ||
    normalized.endsWith('gulpfile.js') ||
    normalized.endsWith('gruntfile.js')
  )
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
    while (
      configPath &&
      !visited.has(configPath) &&
      fs.existsSync(configPath)
    ) {
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
  const sourceExtensions = [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mts',
    '.cts',
    '.mjs',
    '.cjs',
    '.py',
    '.pyi',
    '.rs',
    '.go',
    '.java',
    '.kt',
    '.kts',
    '.cs',
    '.c',
    '.cc',
    '.cpp',
    '.cxx',
    '.h',
    '.hh',
    '.hpp',
    '.hxx',
    '.rb',
    '.php',
    '.swift',
    '.gd',
  ]
  const candidates = [
    normalized,
    ...sourceExtensions.map((extension) => `${normalized}${extension}`),
    ...sourceExtensions.map((extension) => `${normalized}/index${extension}`),
    `${normalized}/__init__.py`,
    `${normalized}/mod.rs`,
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
  fromExtension: string,
  importPath: string,
  files: Record<string, IndexedFile>,
  aliases?: TsAliasMap,
): string | null {
  const normalizedImport = importPath.replace(/\\/g, '/')
  let suffixSpecifier = normalizedImport
  if (fromExtension === '.gd') {
    return resolveModuleCandidates(
      normalizedImport.replace(/^res:\/\//, ''),
      files,
    )
  }
  if (
    ['.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx', '.rb'].includes(
      fromExtension,
    )
  ) {
    const fromDir = path.posix.dirname(fromFilePath.replace(/\\/g, '/'))
    const local = resolveModuleCandidates(
      path.posix.normalize(path.posix.join(fromDir, normalizedImport)),
      files,
    )
    if (local) return local
  }
  if (['.java', '.kt', '.kts', '.cs', '.php'].includes(fromExtension)) {
    const dottedPath = normalizedImport.replace(/\./g, '/')
    suffixSpecifier = dottedPath
    if (['.java', '.kt', '.kts', '.php'].includes(fromExtension)) {
      const declared = resolveDeclaredPackageImport(
        dottedPath,
        fromExtension,
        files,
      )
      if (declared) return declared
    } else {
      const exact = resolveModuleCandidates(dottedPath, files)
      if (exact) return exact
    }
  }
  if (fromExtension === '.rs') {
    const fromDir = path.posix.dirname(fromFilePath.replace(/\\/g, '/'))
    const rustPath = normalizedImport
      .replace(/^crate::/, '')
      .replace(/^self::/, '')
      .replace(/^super::/, '../')
      .replace(/::/g, '/')
    const local = resolveModuleCandidates(
      path.posix.normalize(path.posix.join(fromDir, rustPath)),
      files,
    )
    if (local) return local
    const crateRelative = resolveModuleCandidates(`src/${rustPath}`, files)
    if (crateRelative) return crateRelative
  }
  if (['.py', '.pyi'].includes(fromExtension)) {
    const leadingDots = normalizedImport.match(/^\.+/)?.[0].length ?? 0
    const modulePath = normalizedImport.slice(leadingDots).replace(/\./g, '/')
    if (leadingDots > 0) {
      let baseDir = path.posix.dirname(fromFilePath.replace(/\\/g, '/'))
      for (let index = 1; index < leadingDots; index++)
        baseDir = path.posix.dirname(baseDir)
      const relative = resolveModuleCandidates(
        path.posix.join(baseDir, modulePath),
        files,
      )
      if (relative) return relative
    }
    const absolute = resolveModuleCandidates(modulePath, files)
    if (absolute) return absolute
  }
  if (normalizedImport.startsWith('.')) {
    const fromDir = path.posix.dirname(fromFilePath.replace(/\\/g, '/'))
    const normalizedBase = path.posix.normalize(
      path.posix.join(fromDir, normalizedImport),
    )
    return resolveModuleCandidates(normalizedBase, files)
  }
  // Non-relative: try tsconfig path aliases (workspace-internal imports).
  if (aliases) {
    const aliasResolved = resolveAliasImport(normalizedImport, aliases, files)
    if (aliasResolved) return aliasResolved
  }
  // Go module imports and Ruby load paths often include a repository/module
  // prefix. Resolve only an unambiguous suffix to avoid inventing graph edges.
  if (fromExtension !== '.go') {
    return null
  }
  const goModule = files['go.mod']?.contentSample?.match(
    /^\s*module\s+([^\s]+)\s*$/m,
  )?.[1]
  if (!goModule || !normalizedImport.startsWith(`${goModule}/`)) return null
  suffixSpecifier = normalizedImport.slice(goModule.length + 1)
  const suffixMatches = Object.keys(files).filter((candidate) => {
    const withoutExtension = candidate.replace(/\.[^.\/]+$/, '')
    const packageDirectory = path.posix.dirname(withoutExtension)
    return (
      suffixSpecifier.endsWith(withoutExtension) ||
      withoutExtension.endsWith(suffixSpecifier) ||
      (fromExtension === '.go' &&
        packageDirectory !== '.' &&
        suffixSpecifier.endsWith(packageDirectory))
    )
  })
  if (suffixMatches.length === 1) return suffixMatches[0]
  return null
}

function resolveDeclaredPackageImport(
  importPath: string,
  fromExtension: string,
  files: Record<string, IndexedFile>,
): string | null {
  const segments = importPath.split('/').filter(Boolean)
  if (segments.length < 2) return null
  const symbolName = segments.at(-1)!
  const packageName = segments
    .slice(0, -1)
    .join(fromExtension === '.php' ? '\\' : '.')
  const allowedExtensions =
    fromExtension === '.php' ? new Set(['.php']) : new Set(['.java', '.kt'])
  const matches = Object.values(files).filter((candidate) => {
    if (!allowedExtensions.has(candidate.ext)) return false
    if (path.posix.basename(candidate.path, candidate.ext) !== symbolName) {
      return false
    }
    const sample = candidate.contentSample ?? ''
    if (fromExtension === '.php') {
      return new RegExp(
        `^\\s*namespace\\s+${escapeRegex(packageName)}\\s*;`,
        'm',
      ).test(sample)
    }
    return new RegExp(
      `^\\s*package\\s+${escapeRegex(packageName)}\\s*;?`,
      'm',
    ).test(sample)
  })
  return matches.length === 1 ? matches[0].path : null
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
