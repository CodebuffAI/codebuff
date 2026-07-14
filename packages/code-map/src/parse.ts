import * as fs from 'fs'
import * as path from 'path'

import { getLanguageConfig, hasLanguageConfiguration } from './languages'

import type { LanguageConfig } from './languages'
import type { Parser, Query } from 'web-tree-sitter'

export const DEBUG_PARSING = false
const IGNORE_TOKENS = ['__init__', '__post_init__', '__call__', 'constructor']
const MAX_CALLERS = 25
const DEFAULT_MAX_PARSE_FILES = 10_000
const DEFAULT_MAX_PARSE_FILE_BYTES = 1_000_000
const DEFAULT_MAX_TOTAL_PARSE_BYTES = 500_000_000

const MAX_PARSE_FILES = getPositiveIntegerEnv(
  'CODEBUFF_MAX_PARSE_FILES',
  DEFAULT_MAX_PARSE_FILES,
)
const MAX_PARSE_FILE_BYTES = getPositiveIntegerEnv(
  'CODEBUFF_MAX_PARSE_FILE_BYTES',
  DEFAULT_MAX_PARSE_FILE_BYTES,
)
const MAX_TOTAL_PARSE_BYTES = getPositiveIntegerEnv(
  'CODEBUFF_MAX_TOTAL_PARSE_BYTES',
  DEFAULT_MAX_TOTAL_PARSE_BYTES,
)

export interface ParseDiagnostic {
  filePath: string
  stage: 'language' | 'read' | 'parse'
  message: string
}

export interface ParseBudget {
  maxFiles: number
  maxFileBytes: number
  maxTotalBytes: number
}

export interface ParseCoverage {
  requestedFiles: number
  parsedFiles: number
  reusedFiles: number
  freshParsedFiles: number
  parsedBytes: number
  skippedFiles: number
  skippedKnownBytes: number
  skippedPrefixes: string[]
  skippedLanguages: string[]
  fileBudgetExceeded: boolean
  byteBudgetExceeded: boolean
  oversizedFiles: number
  maxFiles: number
  maxFileBytes: number
  maxTotalBytes: number
  truncated: boolean
}

type ParseTokensOptions = {
  maxBytes?: number
  remainingBytes?: number
  diagnostics?: ParseDiagnostic[]
}

type ParsedTokens = {
  numLines: number
  identifiers: string[]
  calls: string[]
}

type ParsedTokensForScoring = ParsedTokens & {
  bytes: number
  skipped: boolean
  skipReason?:
    | 'file_too_large'
    | 'total_byte_budget'
    | 'source_unavailable'
    | 'read_error'
    | 'parse_error'
}

type SourceReader = (filePath: string) => string | null | Promise<string | null>

type FileCallData = {
  calls: string[]
  scores: Record<string, number>
}

export interface TokenCallerMap {
  [filePath: string]: {
    [token: string]: string[] // Array of files that call this token
  }
}

export interface FileTokenData {
  tokenScores: { [filePath: string]: { [token: string]: number } }
  tokenCallers: TokenCallerMap
}

/** Raw per-file parse output, cacheable so unchanged files skip re-parsing. */
export interface ParsedFileTokens {
  identifiers: string[]
  calls: string[]
  numLines: number
}

export async function getFileTokenScores(
  projectRoot: string,
  filePaths: string[],
  readFile?: SourceReader,
  reuseParsed?: Record<string, ParsedFileTokens>,
  budgetOverrides: Partial<ParseBudget> = {},
): Promise<
  FileTokenData & {
    parsed: Record<string, ParsedFileTokens>
    diagnostics: ParseDiagnostic[]
    coverage: ParseCoverage
  }
> {
  const startTime = Date.now()
  const tokenScores: Record<string, Record<string, number>> = {}
  const externalCalls: Record<string, number> = {}
  const fileCallsMap = new Map<string, string[]>()
  const parsedByPath: Record<string, ParsedFileTokens> = {}
  const diagnostics: ParseDiagnostic[] = []
  const budget: ParseBudget = {
    maxFiles: budgetOverrides.maxFiles ?? MAX_PARSE_FILES,
    maxFileBytes: budgetOverrides.maxFileBytes ?? MAX_PARSE_FILE_BYTES,
    maxTotalBytes: budgetOverrides.maxTotalBytes ?? MAX_TOTAL_PARSE_BYTES,
  }
  let freshParsedFiles = 0
  let reusedFiles = 0
  let totalParsedBytes = 0
  let skippedKnownBytes = 0
  let oversizedFiles = 0
  let fileBudgetExceeded = false
  let byteBudgetExceeded = false
  const skippedPaths: string[] = []
  const skippedLanguages = new Set<string>()

  // Round-robin top-level-prefix/language buckets so a tight parse budget does
  // not erase every symbol from directories that happen to sort last.
  for (const filePath of fairParseOrder(filePaths)) {
    const fullPath = path.join(projectRoot, filePath)

    // Incremental fast path: reuse a prior parse for an unchanged file. The
    // caller is responsible for only passing reuse entries for files whose
    // content has not changed (verified by hash/mtime in the indexer).
    const reused = reuseParsed?.[filePath]
    let parsed: ParsedFileTokens
    if (reused) {
      parsed = reused
      reusedFiles++
    } else {
      if (freshParsedFiles >= budget.maxFiles) {
        fileBudgetExceeded = true
        skippedPaths.push(filePath)
        skippedLanguages.add(path.extname(filePath) || 'unknown')
        skippedKnownBytes += getKnownFileSize(fullPath)
        continue
      }
      if (totalParsedBytes >= budget.maxTotalBytes) {
        byteBudgetExceeded = true
        skippedPaths.push(filePath)
        skippedLanguages.add(path.extname(filePath) || 'unknown')
        skippedKnownBytes += getKnownFileSize(fullPath)
        continue
      }
      const languageConfig = await getLanguageConfig(fullPath)
      if (!languageConfig) {
        skippedPaths.push(filePath)
        skippedKnownBytes += getKnownFileSize(fullPath)
        skippedLanguages.add(path.extname(filePath) || 'unknown')
        diagnostics.push({
          filePath,
          stage: 'language',
          message: hasLanguageConfiguration(fullPath)
            ? `Tree-sitter grammar failed to load for ${path.extname(filePath) || 'file'}. Verify the packaged language WASM files and CODEBUFF_WASM_DIR.`
            : `No tree-sitter language configuration available for ${path.extname(filePath) || 'file'}`,
        })
        continue
      }

      const result = await parseTokensForScoring({
        filePath,
        fullPath,
        languageConfig,
        readFile,
        maxFileBytes: budget.maxFileBytes,
        remainingBytes: budget.maxTotalBytes - totalParsedBytes,
        diagnostics,
      })
      if (result.skipped) {
        skippedPaths.push(filePath)
        skippedLanguages.add(path.extname(filePath) || 'unknown')
        if (result.skipReason === 'file_too_large') oversizedFiles++
        if (result.skipReason === 'total_byte_budget') byteBudgetExceeded = true
        skippedKnownBytes += result.bytes || getKnownFileSize(fullPath)
        continue
      }

      freshParsedFiles++
      totalParsedBytes += result.bytes
      parsed = {
        identifiers: result.identifiers,
        calls: result.calls,
        numLines: result.numLines,
      }
    }

    parsedByPath[filePath] = parsed
    const { scores, calls } = scoreFileTokens(fullPath, parsed)
    tokenScores[filePath] = scores
    fileCallsMap.set(filePath, calls)

    for (const call of calls) {
      if (!scores[call]) {
        externalCalls[call] = (externalCalls[call] ?? 0) + 1
      }
    }
  }

  const tokenCallers = buildTokenCallers(tokenScores, fileCallsMap)
  boostScoresByExternalCalls(tokenScores, externalCalls)

  if (DEBUG_PARSING) {
    const endTime = Date.now()
    console.log(`Parsed ${filePaths.length} files in ${endTime - startTime}ms`)

    try {
      fs.writeFileSync(
        '../debug/debug-parse.json',
        JSON.stringify({
          tokenCallers,
          tokenScores,
          fileCallsMap,
          externalCalls,
        }),
      )
    } catch {
      // Silently ignore debug file write errors in test environments
    }
  }

  const coverage: ParseCoverage = {
    requestedFiles: filePaths.length,
    parsedFiles: Object.keys(parsedByPath).length,
    reusedFiles,
    freshParsedFiles,
    parsedBytes: totalParsedBytes,
    skippedFiles: skippedPaths.length,
    skippedKnownBytes,
    skippedPrefixes: Array.from(
      new Set(skippedPaths.map((filePath) => topLevelPrefix(filePath))),
    ).sort(),
    skippedLanguages: Array.from(skippedLanguages).sort(),
    fileBudgetExceeded,
    byteBudgetExceeded,
    oversizedFiles,
    maxFiles: budget.maxFiles,
    maxFileBytes: budget.maxFileBytes,
    maxTotalBytes: budget.maxTotalBytes,
    truncated: skippedPaths.length > 0,
  }

  return {
    tokenScores,
    tokenCallers,
    parsed: parsedByPath,
    diagnostics,
    coverage,
  }
}

export function parseTokens(
  filePath: string,
  languageConfig: LanguageConfig,
  readFile?: (filePath: string) => string | null,
  options: ParseTokensOptions = {},
): ParsedTokens {
  const { numLines, identifiers, calls } = parseTokensWithLimits(
    filePath,
    languageConfig,
    readFile,
    options,
  )
  return { numLines, identifiers, calls }
}

async function parseTokensForScoring(params: {
  filePath: string
  fullPath: string
  languageConfig: LanguageConfig
  readFile?: SourceReader
  maxFileBytes: number
  remainingBytes: number
  diagnostics: ParseDiagnostic[]
}): Promise<ParsedTokensForScoring> {
  const {
    filePath,
    fullPath,
    languageConfig,
    readFile,
    maxFileBytes,
    remainingBytes,
    diagnostics,
  } = params

  if (!readFile) {
    return parseTokensWithLimits(fullPath, languageConfig, undefined, {
      maxBytes: maxFileBytes,
      remainingBytes,
      diagnostics,
    })
  }

  try {
    const source = await readFile(filePath)
    return parseTokensWithLimits(filePath, languageConfig, () => source, {
      maxBytes: maxFileBytes,
      remainingBytes,
      diagnostics,
    })
  } catch (e) {
    diagnostics.push({
      filePath,
      stage: 'read',
      message: getErrorMessage(e),
    })
    if (DEBUG_PARSING) {
      console.error(`Error reading source: ${e}`)
      console.log(filePath)
    }
    return emptyParsedTokens('read_error')
  }
}

function parseTokensWithLimits(
  filePath: string,
  languageConfig: LanguageConfig,
  readFile: ((filePath: string) => string | null) | undefined,
  options: ParseTokensOptions,
): ParsedTokensForScoring {
  const { parser, query } = languageConfig

  try {
    const maxBytes = options.maxBytes ?? MAX_PARSE_FILE_BYTES
    const remainingBytes = options.remainingBytes ?? MAX_TOTAL_PARSE_BYTES
    if (remainingBytes <= 0) {
      return emptyParsedTokens('total_byte_budget')
    }

    const loaded = loadSourceWithinLimits({
      filePath,
      readFile,
      maxBytes,
      remainingBytes,
    })
    if (!loaded.source) {
      return emptyParsedTokens(loaded.skipReason, loaded.bytes)
    }
    const source = loaded.source

    if (!parser || !query) {
      throw new Error('Parser or query not found')
    }

    const parseResults = parseFile(parser, query, source.code)
    const identifiers = Array.from(new Set(parseResults.identifier))
    const calls = Array.from(new Set(parseResults['call.identifier']))

    if (DEBUG_PARSING) {
      console.log(`\nParsing ${filePath}:`)
      console.log('Identifiers:', identifiers)
      console.log('Calls:', calls)
    }

    return {
      numLines: countLines(source.code),
      identifiers: identifiers ?? [],
      calls: calls ?? [],
      bytes: source.bytes,
      skipped: false,
    }
  } catch (e) {
    options.diagnostics?.push({
      filePath,
      stage: 'parse',
      message: getErrorMessage(e),
    })
    if (DEBUG_PARSING) {
      console.error(`Error parsing query: ${e}`)
      console.log(filePath)
    }
    return emptyParsedTokens('parse_error')
  }
}

function loadSourceWithinLimits(params: {
  filePath: string
  readFile?: (filePath: string) => string | null
  maxBytes: number
  remainingBytes: number
}): {
  source: { code: string; bytes: number } | null
  skipReason?: ParsedTokensForScoring['skipReason']
  bytes: number
} {
  const { filePath, readFile, maxBytes, remainingBytes } = params

  if (!readFile) {
    const bytes = fs.statSync(filePath).size
    if (bytes > maxBytes) {
      return { source: null, skipReason: 'file_too_large', bytes }
    }
    if (bytes > remainingBytes) {
      return { source: null, skipReason: 'total_byte_budget', bytes }
    }

    return {
      source: { code: fs.readFileSync(filePath, 'utf8'), bytes },
      bytes,
    }
  }

  const code = readFile(filePath)
  if (code === null) {
    return { source: null, skipReason: 'source_unavailable', bytes: 0 }
  }

  const bytes = Buffer.byteLength(code, 'utf8')
  if (bytes > maxBytes) {
    return { source: null, skipReason: 'file_too_large', bytes }
  }
  if (bytes > remainingBytes) {
    return { source: null, skipReason: 'total_byte_budget', bytes }
  }

  return { source: { code, bytes }, bytes }
}

function scoreFileTokens(fullPath: string, parsed: ParsedTokens): FileCallData {
  const scores: Record<string, number> = {}
  const dirs = path.dirname(fullPath).split(path.sep)
  const depth = dirs.length
  const tokenBaseScore =
    0.8 ** depth * Math.sqrt(parsed.numLines / (parsed.identifiers.length + 1))

  for (const identifier of parsed.identifiers) {
    if (!IGNORE_TOKENS.includes(identifier)) {
      scores[identifier] = tokenBaseScore
    }
  }

  return { scores, calls: parsed.calls }
}

function buildTokenCallers(
  tokenScores: Record<string, Record<string, number>>,
  fileCallsMap: Map<string, string[]>,
): TokenCallerMap {
  const definitions = new Map<
    string,
    Array<{ filePath: string; extension: string }>
  >()

  for (const [filePath, scores] of Object.entries(tokenScores)) {
    for (const token of Object.keys(scores)) {
      ;(definitions.get(token) ?? definitions.set(token, []).get(token)!).push({
        filePath,
        extension: path.extname(filePath).toLowerCase(),
      })
    }
  }

  const tokenCallers: TokenCallerMap = {}
  for (const [callingFile, calls] of fileCallsMap.entries()) {
    for (const call of calls) {
      const candidates = definitions.get(call) ?? []
      const callerLanguage = getLanguageFamily(callingFile)
      const sameLanguage = candidates.filter(
        (candidate) =>
          getLanguageFamily(candidate.extension) === callerLanguage,
      )
      // Resolve only when the raw name is unambiguous in the caller's language
      // (or globally when no same-language definition exists). Import-aware
      // graph construction can add stronger edges later; guessing here creates
      // false blast-radius relationships in polyglot/monorepo codebases.
      const eligible = sameLanguage
      const definingFile =
        eligible.length === 1 ? eligible[0]?.filePath : undefined
      if (!definingFile || callingFile === definingFile) {
        continue
      }

      const callersByToken = (tokenCallers[definingFile] ??= {})
      const callerFiles = (callersByToken[call] ??= [])
      if (
        callerFiles.length < MAX_CALLERS &&
        !callerFiles.includes(callingFile)
      ) {
        callerFiles.push(callingFile)
      }
    }
  }

  return tokenCallers
}

function boostScoresByExternalCalls(
  tokenScores: Record<string, Record<string, number>>,
  externalCalls: Record<string, number>,
): void {
  for (const scores of Object.values(tokenScores)) {
    for (const token of Object.keys(scores)) {
      const numCalls = externalCalls[token] ?? 0
      scores[token] *= 1 + Math.log(1 + numCalls)
      scores[token] = Math.round(scores[token] * 1000) / 1000
    }
  }
}

function emptyParsedTokens(
  skipReason?: ParsedTokensForScoring['skipReason'],
  bytes = 0,
): ParsedTokensForScoring {
  return {
    numLines: 0,
    identifiers: [],
    calls: [],
    bytes,
    skipped: Boolean(skipReason),
    skipReason,
  }
}

function fairParseOrder(filePaths: string[]): string[] {
  const buckets = new Map<string, string[]>()
  for (const filePath of filePaths) {
    const key = `${topLevelPrefix(filePath)}\0${path.extname(filePath).toLowerCase()}`
    ;(buckets.get(key) ?? buckets.set(key, []).get(key)!).push(filePath)
  }
  const queues = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, files]) => files)
  const ordered: string[] = []
  for (let offset = 0; ordered.length < filePaths.length; offset++) {
    for (const queue of queues) {
      const filePath = queue[offset]
      if (filePath !== undefined) ordered.push(filePath)
    }
  }
  return ordered
}

function topLevelPrefix(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const slash = normalized.indexOf('/')
  return slash === -1 ? '.' : normalized.slice(0, slash)
}

function getLanguageFamily(filePathOrExtension: string): string {
  const extension = filePathOrExtension.startsWith('.')
    ? filePathOrExtension.toLowerCase()
    : path.extname(filePathOrExtension).toLowerCase()
  if (['.ts', '.tsx', '.mts', '.cts'].includes(extension)) return 'typescript'
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(extension)) return 'javascript'
  if (['.c', '.h'].includes(extension)) return 'c'
  if (['.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx'].includes(extension)) {
    return 'cpp'
  }
  if (['.kt', '.kts'].includes(extension)) return 'kotlin'
  return extension
}

function getKnownFileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size
  } catch {
    return 0
  }
}

function countLines(sourceCode: string): number {
  return (sourceCode.match(/\n/g)?.length ?? 0) + 1
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback

  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseFile(
  parser: Parser,
  query: Query,
  sourceCode: string,
): { [key: string]: string[] } {
  const tree = parser.parse(sourceCode)
  if (!tree) {
    return {}
  }
  try {
    const captures = query.captures(tree.rootNode)
    const result: { [key: string]: string[] } = {}

    for (const capture of captures) {
      const { name, node } = capture
      if (!result[name]) {
        result[name] = []
      }
      result[name].push(node.text)
    }

    return result
  } finally {
    ;(tree as { delete?: () => void }).delete?.()
  }
}
