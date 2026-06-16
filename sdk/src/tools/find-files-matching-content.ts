import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

import { getBundledRgPath } from '../native/ripgrep'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

// Hidden directories that are included in the search by default (mirrors
// code-search to keep behavior consistent across the two tools).
const INCLUDED_HIDDEN_DIRS = [
  '.agents',
  '.claude',
  '.github',
  '.gitlab',
  '.circleci',
  '.husky',
]

const DEFAULT_EXCLUDED_GLOBS = [
  '!**/node_modules/**',
  '!**/.bun-install/**',
  '!**/dist/**',
  '!**/build/**',
  '!**/.next/**',
  '!**/.turbo/**',
  '!**/*.generated.*',
  '!**/bundled-agents.generated.ts',
]

// Safety caps to keep memory bounded even when groupBySymbol expands work.
const HARD_MATCH_LIMIT = 5_000
const MAX_FILE_BYTES_FOR_SYMBOLS = 1_000_000 // 1MB per file is plenty
/**
 * Hard cap on any single unprocessed stdout line. Normal ripgrep output is
 * line-oriented, so we stream-complete lines into bounded sets and only keep a
 * small trailing partial line in memory. A huge unterminated line is suspicious
 * or pathological; return partial results instead of growing without bound.
 */
const MAX_PENDING_STDOUT_LINE_BYTES = 1024 * 1024

export function findFilesMatchingContent({
  projectPath,
  pattern,
  flags,
  cwd,
  maxFiles = 100,
  groupBySymbol = false,
  timeoutSeconds = 15,
  logger,
}: {
  projectPath: string
  pattern: string
  flags?: string
  cwd?: string
  maxFiles?: number
  groupBySymbol?: boolean
  timeoutSeconds?: number
  logger?: Logger
}): Promise<CodebuffToolOutput<'find_files_matching_content'>> {
  return new Promise((resolve) => {
    let isResolved = false

    const projectRoot = path.resolve(projectPath)
    const searchCwd = cwd ? path.resolve(projectRoot, cwd) : projectRoot

    if (!isPathInside(searchCwd, projectRoot)) {
      return resolve([
        {
          type: 'json',
          value: {
            errorMessage: `Invalid cwd: Path '${cwd}' is outside the project directory.`,
          },
        },
      ])
    }

    let projectRootReal: string
    let searchCwdReal: string
    try {
      projectRootReal = fs.realpathSync.native(projectRoot)
      searchCwdReal = fs.realpathSync.native(searchCwd)
    } catch {
      return resolve([
        {
          type: 'json',
          value: {
            errorMessage: `Invalid cwd: Path '${cwd ?? '.'}' does not exist or cannot be read.`,
          },
        },
      ])
    }

    if (!isPathInside(searchCwdReal, projectRootReal)) {
      return resolve([
        {
          type: 'json',
          value: {
            errorMessage: `Invalid cwd: Path '${cwd}' is outside the project directory.`,
          },
        },
      ])
    }

    const parsedFlags = parseSafeRipgrepFlags(flags || '')
    if ('errorMessage' in parsedFlags) {
      return resolve([
        {
          type: 'json',
          value: parsedFlags,
        },
      ])
    }
    const flagsArray = parsedFlags.flags

    const existingHiddenDirs = INCLUDED_HIDDEN_DIRS.filter((dir) => {
      try {
        return fs.statSync(path.join(searchCwd, dir)).isDirectory()
      } catch {
        return false
      }
    })
    const searchPaths = ['.', ...existingHiddenDirs]

    // When groupBySymbol is requested, we need line numbers, so we stream JSON
    // matches and aggregate ourselves. Otherwise we can use ripgrep's much
    // cheaper `-l` (--files-with-matches) mode.
    const args = groupBySymbol
      ? [
          '--no-config',
          '-n',
          '--json',
          ...DEFAULT_EXCLUDED_GLOBS.flatMap((glob) => ['-g', glob]),
          ...flagsArray,
          '--',
          pattern,
          ...searchPaths,
        ]
      : [
          '--no-config',
          '-l',
          ...DEFAULT_EXCLUDED_GLOBS.flatMap((glob) => ['-g', glob]),
          ...flagsArray,
          '--',
          pattern,
          ...searchPaths,
        ]

    const rgPath = getBundledRgPath(import.meta.url)
    if (logger) {
      logger.info(
        { rgPath, args, searchCwd, groupBySymbol },
        'find-files-matching-content: Spawning ripgrep process',
      )
    }

    const childProcess = spawn(rgPath, args, {
      cwd: searchCwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdoutBuf = ''
    let stderrBuf = ''
    // For files-with-matches mode: stream complete path lines into a bounded
    // ordered de-dupe list instead of accumulating all rg output in memory.
    const filesWithoutGroups: string[] = []
    const seenFilesWithoutGroups = new Set<string>()
    // For groupBySymbol: collect per-file (line -> 1) sets
    const matchesByFile = new Map<string, Set<number>>()
    let totalMatches = 0
    let truncatedByLimit = false
    let killTimeoutId: ReturnType<typeof setTimeout> | null = null

    const clearKillFallback = () => {
      if (!killTimeoutId) return
      clearTimeout(killTimeoutId)
      killTimeoutId = null
    }

    const settle = (payload: any) => {
      if (isResolved) return
      isResolved = true
      childProcess.stdout.removeAllListeners()
      childProcess.stderr.removeAllListeners()
      clearTimeout(timeoutId)
      resolve([{ type: 'json', value: payload }])
    }

    const hardKill = () => {
      try {
        childProcess.kill('SIGTERM')
      } catch {}
      if (killTimeoutId) return
      killTimeoutId = setTimeout(() => {
        try {
          childProcess.kill('SIGKILL')
        } catch {
          try {
            childProcess.kill()
          } catch {}
        }
        killTimeoutId = null
      }, 1000)
      if (
        killTimeoutId &&
        typeof killTimeoutId === 'object' &&
        'unref' in killTimeoutId &&
        typeof killTimeoutId.unref === 'function'
      ) {
        killTimeoutId.unref()
      }
    }

    const timeoutId = setTimeout(() => {
      if (isResolved) return
      hardKill()
      // Build partial result from whatever we've collected so far.
      const partial = buildSuccessPayload({
        groupBySymbol,
        stdoutBuf,
        filesWithoutGroups,
        matchesByFile,
        maxFiles,
        truncatedByLimit: true,
        projectRoot,
        searchCwd,
        pattern,
        timedOut: true,
        timeoutSeconds,
      })
      settle(partial)
    }, timeoutSeconds * 1000)

    childProcess.stdout.on('data', (chunk: Buffer | string) => {
      if (isResolved) return
      const chunkStr =
        typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      stdoutBuf += chunkStr
      const lines = stdoutBuf.split('\n')
      stdoutBuf = lines.pop() || ''

      if (stdoutBuf.length > MAX_PENDING_STDOUT_LINE_BYTES) {
        stdoutBuf = ''
        // Refuse to keep an unterminated stdout line that grows without bound.
        // Complete lines have already been processed into bounded collections.
        truncatedByLimit = true
        hardKill()
        settle(
          buildSuccessPayload({
            groupBySymbol,
            stdoutBuf: '',
            filesWithoutGroups,
            matchesByFile,
            maxFiles,
            truncatedByLimit: true,
            projectRoot,
            searchCwd,
            pattern,
            timedOut: false,
            timeoutSeconds,
          }),
        )
        return
      }

      if (!groupBySymbol) {
        for (const line of lines) {
          const file = line.trim()
          if (!file) continue
          const projectRelativeFile = toProjectRelativeFile(
            projectRoot,
            searchCwd,
            file,
          )
          if (seenFilesWithoutGroups.has(projectRelativeFile)) continue
          seenFilesWithoutGroups.add(projectRelativeFile)
          filesWithoutGroups.push(projectRelativeFile)
          if (filesWithoutGroups.length >= maxFiles) {
            truncatedByLimit = true
            hardKill()
            settle(
              buildSuccessPayload({
                groupBySymbol,
                stdoutBuf: '',
                filesWithoutGroups,
                matchesByFile,
                maxFiles,
                truncatedByLimit: true,
                projectRoot,
                searchCwd,
                pattern,
                timedOut: false,
                timeoutSeconds,
              }),
            )
            return
          }
        }
        return
      }


      for (const line of lines) {
        if (!line) continue
        let evt: any
        try {
          evt = JSON.parse(line)
        } catch {
          continue
        }
        if (evt.type !== 'match') continue

        const filePath = evt.data.path?.text ?? evt.data.path?.bytes ?? ''
        const lineNumber = evt.data.line_number ?? 0
        if (!filePath || !lineNumber) continue

        let fileMatches = matchesByFile.get(filePath)
        if (!fileMatches) {
          if (matchesByFile.size >= maxFiles) {
            truncatedByLimit = true
            hardKill()
            settle(
              buildSuccessPayload({
                groupBySymbol,
                stdoutBuf: '',
                filesWithoutGroups,
                matchesByFile,
                maxFiles,
                truncatedByLimit: true,
                projectRoot,
                searchCwd,
                pattern,
                timedOut: false,
                timeoutSeconds,
              }),
            )
            return
          }
          fileMatches = new Set<number>()
          matchesByFile.set(filePath, fileMatches)
        }
        if (!fileMatches.has(lineNumber)) {
          fileMatches.add(lineNumber)
          totalMatches++
          if (totalMatches >= HARD_MATCH_LIMIT) {
            truncatedByLimit = true
            hardKill()
            settle(
              buildSuccessPayload({
                groupBySymbol,
                stdoutBuf: '',
                filesWithoutGroups,
                matchesByFile,
                maxFiles,
                truncatedByLimit: true,
                projectRoot,
                searchCwd,
                pattern,
                timedOut: false,
                timeoutSeconds,
              }),
            )
            return
          }
        }
      }
    })

    childProcess.stderr.on('data', (chunk: Buffer | string) => {
      if (isResolved) return
      const chunkStr =
        typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      if (stderrBuf.length < 4_000) {
        stderrBuf += chunkStr.slice(0, 4_000 - stderrBuf.length)
      }
    })

    childProcess.once('close', (code) => {
      clearKillFallback()
      if (isResolved) return
      if (code !== 0 && code !== 1 && stderrBuf.trim().length > 0) {
        return settle({
          errorMessage: `ripgrep exited with code ${code}: ${stderrBuf.trim()}`,
        })
      }
      // Flush any remaining partial line.
      if (stdoutBuf) {
        const trailing = stdoutBuf
        stdoutBuf = ''
        if (groupBySymbol) {
          for (const line of trailing.split('\n')) {
            if (!line) continue
            try {
              const evt = JSON.parse(line)
              if (evt.type !== 'match') continue
              const filePath = evt.data.path?.text ?? evt.data.path?.bytes ?? ''
              const lineNumber = evt.data.line_number ?? 0
              if (!filePath || !lineNumber) continue
              let fileMatches = matchesByFile.get(filePath)
              if (!fileMatches) {
                if (matchesByFile.size >= maxFiles) {
                  truncatedByLimit = true
                  continue
                }
                fileMatches = new Set<number>()
                matchesByFile.set(filePath, fileMatches)
              }
              if (!fileMatches.has(lineNumber)) {
                fileMatches.add(lineNumber)
                totalMatches++
              }
            } catch {}
          }
        } else {
          const file = trailing.trim()
          if (file) {
            const projectRelativeFile = toProjectRelativeFile(
              projectRoot,
              searchCwd,
              file,
            )
            if (!seenFilesWithoutGroups.has(projectRelativeFile)) {
              seenFilesWithoutGroups.add(projectRelativeFile)
              filesWithoutGroups.push(projectRelativeFile)
            }
          }
        }
      }

      settle(
        buildSuccessPayload({
          groupBySymbol,
          stdoutBuf,
          filesWithoutGroups,
          matchesByFile,
          maxFiles,
          truncatedByLimit,
          projectRoot,
          searchCwd,
          pattern,
          timedOut: false,
          timeoutSeconds,
        }),
      )
    })

    childProcess.once('error', (error) => {
      clearKillFallback()
      if (isResolved) return
      settle({
        errorMessage: `Failed to execute ripgrep: ${error.message}. Vendored ripgrep not found; ensure @codebuff/sdk is up-to-date or set CODEBUFF_RG_PATH.`,
      })
    })
  })
}

function buildSuccessPayload(opts: {
  groupBySymbol: boolean
  stdoutBuf: string
  filesWithoutGroups: string[]
  matchesByFile: Map<string, Set<number>>
  maxFiles: number
  truncatedByLimit: boolean
  projectRoot: string
  searchCwd: string
  pattern: string
  timedOut: boolean
  timeoutSeconds: number
}) {
  const {
    groupBySymbol,
    stdoutBuf,
    filesWithoutGroups,
    matchesByFile,
    maxFiles,
    truncatedByLimit,
    projectRoot,
    searchCwd,
    pattern,
    timedOut,
    timeoutSeconds,
  } = opts

  let files: string[]
  let groups:
    | Array<{ file: string; matchCount: number; symbols: string[] }>
    | undefined

  if (groupBySymbol) {
    const entries = Array.from(matchesByFile.entries()).slice(0, maxFiles)
    files = entries.map(([file]) =>
      toProjectRelativeFile(projectRoot, searchCwd, file),
    )
    groups = entries.map(([file, matchLines]) => ({
      file: toProjectRelativeFile(projectRoot, searchCwd, file),
      matchCount: matchLines.size,
      symbols: extractSymbolsForLines(
        path.resolve(searchCwd, file),
        matchLines,
      ),
    }))
  } else {
    files = filesWithoutGroups.slice(0, maxFiles)
  }

  return {
    files,
    count: files.length,
    ...(truncatedByLimit ? { truncated: true } : {}),
    ...(groups ? { groups } : {}),
    message: buildMessage({
      count: files.length,
      pattern,
      truncated: truncatedByLimit,
      timedOut,
      timeoutSeconds,
    }),
  }
}

function toProjectRelativeFile(
  projectRoot: string,
  searchCwd: string,
  file: string,
): string {
  return path
    .relative(projectRoot, path.resolve(searchCwd, file))
    .split(path.sep)
    .join('/')
}

function isPathInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

function parseSafeRipgrepFlags(
  flags: string,
): { flags: string[] } | { errorMessage: string } {
  const tokens = splitFlagTokens(flags)
  if (!tokens.ok) return { errorMessage: tokens.errorMessage }

  const result: string[] = []
  const switchesWithoutValue = new Set([
    '-i',
    '--ignore-case',
    '-S',
    '--smart-case',
    '-s',
    '--case-sensitive',
    '-w',
    '--word-regexp',
    '-F',
    '--fixed-strings',
    '-U',
    '--multiline',
    '--multiline-dotall',
  ])
  const switchesWithValue = new Set([
    '-g',
    '--glob',
    '-t',
    '--type',
    '-T',
    '--type-not',
  ])

  for (let i = 0; i < tokens.tokens.length; i++) {
    const token = tokens.tokens[i]
    const eqIndex = token.indexOf('=')
    if (eqIndex > 0) {
      const name = token.slice(0, eqIndex)
      const value = token.slice(eqIndex + 1)
      if (!switchesWithValue.has(name)) {
        return unsupportedFlag(token)
      }
      if (!value) {
        return { errorMessage: `Invalid ripgrep flag '${token}': missing value.` }
      }
      result.push(name, value)
      continue
    }

    if (switchesWithoutValue.has(token)) {
      result.push(token)
      continue
    }

    if (switchesWithValue.has(token)) {
      const value = tokens.tokens[i + 1]
      if (value === undefined) {
        return { errorMessage: `Invalid ripgrep flag '${token}': missing value.` }
      }
      result.push(token, value)
      i++
      continue
    }

    return unsupportedFlag(token)
  }

  return { flags: result }
}

function unsupportedFlag(token: string): { errorMessage: string } {
  return {
    errorMessage: `Unsupported ripgrep flag '${token}'. Allowed flags: -i/--ignore-case, -S/--smart-case, -s/--case-sensitive, -w/--word-regexp, -F/--fixed-strings, -U/--multiline, --multiline-dotall, -g/--glob, -t/--type, -T/--type-not. Use code_search for advanced ripgrep options.`,
  }
}

function splitFlagTokens(
  flags: string,
): { ok: true; tokens: string[] } | { ok: false; errorMessage: string } {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (let i = 0; i < flags.length; i++) {
    const ch = flags[i]
    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
      continue
    }

    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }

    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += ch
  }

  if (quote) {
    return { ok: false, errorMessage: 'Invalid ripgrep flags: unterminated quote.' }
  }
  if (current) tokens.push(current)
  return { ok: true, tokens }
}

function buildMessage(opts: {
  count: number
  pattern: string
  truncated: boolean
  timedOut: boolean
  timeoutSeconds: number
}): string {
  const parts: string[] = []
  parts.push(
    `Found ${opts.count} unique file(s) matching pattern "${opts.pattern}"`,
  )
  if (opts.truncated) {
    parts.push('(results capped; consider narrowing the pattern or flags)')
  }
  if (opts.timedOut) {
    parts.push(
      `(search timed out after ${opts.timeoutSeconds}s and returned partial results)`,
    )
  }
  return parts.join(' ')
}

/**
 * Heuristic, language-agnostic extraction of the names of top-level
 * declarations that contain the supplied match lines. Designed to be cheap and
 * robust enough for typical source files (JS/TS/Python/Go/Rust). It does NOT
 * try to be a real parser — when no declaration is recognized before a match,
 * the match is dropped from the symbol list (it is still counted in matchCount).
 */
function extractSymbolsForLines(
  absolutePath: string,
  matchLines: Set<number>,
): string[] {
  let content: string
  try {
    const stat = fs.statSync(absolutePath)
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES_FOR_SYMBOLS) {
      return []
    }
    content = fs.readFileSync(absolutePath, 'utf8')
  } catch {
    return []
  }

  const lines = content.split('\n')
  // Build a per-line "containing symbol" map by scanning declarations and
  // tracking brace/indent-based scope closes.
  const lineSymbol: (string | undefined)[] = new Array(lines.length + 1)
  const stack: { name: string; openBraces: number }[] = []

  const declRegex =
    /^\s*(?:export\s+(?:default\s+)?(?:async\s+)?)?(?:async\s+)?(?:function\*?|class|interface|type|enum|struct|impl|trait|fn|def)\s+([A-Za-z_$][A-Za-z0-9_$]*)/
  const varDeclRegex =
    /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:=|:)/
  const methodRegex =
    /^\s*(?:public|private|protected|static|async|override|readonly|\s)*\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*(?::\s*[^={]+)?\s*\{\s*$/

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const rawLine = lines[i]
    const line = rawLine

    // Close any scopes whose braces have been balanced out.
    let opens = countChar(line, '{')
    let closes = countChar(line, '}')
    // First, recognize a new declaration starting here (so the *current* line
    // is attributed to the new symbol).
    let newSymbol: string | undefined
    const varDeclMatch = stack.length === 0 ? line.match(varDeclRegex) : null
    const methodMatch = stack.length > 0 ? line.match(methodRegex) : null
    const declMatch = line.match(declRegex) || varDeclMatch || methodMatch
    if (declMatch) {
      newSymbol = declMatch[1]
    }

    // Apply closing braces from previous scopes *before* attributing this line
    // when the line starts with a closing brace.
    while (stack.length > 0 && closes > 0 && stack[stack.length - 1]) {
      const top = stack[stack.length - 1]
      if (top.openBraces <= closes) {
        closes -= top.openBraces
        stack.pop()
      } else {
        top.openBraces -= closes
        closes = 0
      }
    }

    if (newSymbol) {
      stack.push({ name: newSymbol, openBraces: opens })
      lineSymbol[lineNo] = topName(stack)
    } else {
      // Distribute remaining open braces to the current scope (if any).
      if (stack.length > 0 && opens > 0) {
        stack[stack.length - 1].openBraces += opens
      }
      lineSymbol[lineNo] = topName(stack)
    }
  }

  const symbols = new Set<string>()
  for (const ln of matchLines) {
    const name = lineSymbol[ln]
    if (name) symbols.add(name)
  }
  return Array.from(symbols)
}

function topName(
  stack: { name: string; openBraces: number }[],
): string | undefined {
  return stack.length > 0 ? stack[stack.length - 1].name : undefined
}

function countChar(s: string, ch: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ch) n++
  }
  return n
}
