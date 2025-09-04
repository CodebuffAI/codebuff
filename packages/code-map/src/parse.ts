import * as fs from 'fs'
import * as path from 'path'

import { getLanguageConfig, LanguageConfig } from './languages'
import type { Parser, Query } from 'web-tree-sitter'

export const DEBUG_PARSING = false
const IGNORE_TOKENS = ['__init__', '__post_init__', '__call__', 'constructor']
const MAX_CALLERS = 25

export interface TokenCallerMap {
  [filePath: string]: {
    [token: string]: string[] // Array of files that call this token
  }
}

export interface FileTokenData {
  tokenScores: { [filePath: string]: { [token: string]: number } }
  tokenCallers: TokenCallerMap
}

export async function getFileTokenScores(
  projectRoot: string,
  filePaths: string[],
  readFile?: (filePath: string) => string | null,
): Promise<FileTokenData> {
  const startTime = Date.now()
  const tokenScores: { [filePath: string]: { [token: string]: number } } = {}
  const externalCalls: { [token: string]: number } = {}
  const fileCallsMap = new Map<string, string[]>()

  // First pass: collect all identifiers and calls
  for (const filePath of filePaths) {
    const fullPath = path.join(projectRoot, filePath)
    const languageConfig = await getLanguageConfig(fullPath)
    if (languageConfig) {
      let parseResults
      if (readFile) {
        // When readFile is provided, use relative filePath
        parseResults = parseTokens(filePath, languageConfig, readFile)
      } else {
        // When readFile is not provided, use full path to read from file system
        parseResults = parseTokens(fullPath, languageConfig)
      }
      const { identifiers, calls, numLines } = parseResults

      const tokenScoresForFile: { [token: string]: number } = {}
      tokenScores[filePath] = tokenScoresForFile

      const dirs = path.dirname(fullPath).split(path.sep)
      const depth = dirs.length
      const tokenBaseScore =
        0.8 ** depth * Math.sqrt(numLines / (identifiers.length + 1))

      // Store defined tokens
      for (const identifier of identifiers) {
        if (!IGNORE_TOKENS.includes(identifier)) {
          tokenScoresForFile[identifier] = tokenBaseScore
        }
      }

      // Store calls for this file
      fileCallsMap.set(filePath, calls)

      // Track external calls
      for (const call of calls) {
        if (!tokenScoresForFile[call]) {
          externalCalls[call] = (externalCalls[call] ?? 0) + 1
        }
      }
    }
  }
  // Build a map of tokens to their defining files for O(1) lookup
  const tokenDefinitionMap = new Map<string, string>()
  const highestScores = new Map<string, number>()
  for (const [filePath, scores] of Object.entries(tokenScores)) {
    for (const [token, score] of Object.entries(scores)) {
      const currentHighestScore = highestScores.get(token) ?? -Infinity
      // Keep the file with the higher score for this token
      if (score > currentHighestScore) {
        highestScores.set(token, score)
        tokenDefinitionMap.set(token, filePath)
      }
    }
  }

  const tokenCallers: TokenCallerMap = {}

  // For each file's calls, add it as a caller to the defining file's tokens
  for (const [callingFile, calls] of fileCallsMap.entries()) {
    for (const call of calls) {
      const definingFile = tokenDefinitionMap.get(call)
      if (!definingFile || callingFile === definingFile) {
        continue
      }

      // Skip token names in default objects, e.g. toString, hasOwnProperty
      if (call in {}) {
        continue
      }

      if (!tokenCallers[definingFile]) {
        tokenCallers[definingFile] = {}
      }

      if (!tokenCallers[definingFile][call]) {
        tokenCallers[definingFile][call] = []
      }
      const callerFiles = tokenCallers[definingFile][call]
      if (
        callerFiles.length < MAX_CALLERS &&
        !callerFiles.includes(callingFile)
      ) {
        callerFiles.push(callingFile)
      }
    }
  }

  // Apply call frequency boost to token scores
  for (const scores of Object.values(tokenScores)) {
    for (const token of Object.keys(scores)) {
      const numCalls = externalCalls[token] ?? 0
      if (typeof numCalls !== 'number') continue
      scores[token] *= 1 + Math.log(1 + numCalls)
      // Round to 3 decimal places
      scores[token] = Math.round(scores[token] * 1000) / 1000
    }
  }

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

  return { tokenScores, tokenCallers }
}

export function parseTokens(
  filePath: string,
  languageConfig: LanguageConfig,
  readFile?: (filePath: string) => string | null,
) {
  const { parser, query } = languageConfig

  try {
    const sourceCode = readFile
      ? readFile(filePath)
      : fs.readFileSync(filePath, 'utf8')
    if (sourceCode === null) {
      return {
        numLines: 0,
        identifiers: [] as string[],
        calls: [] as string[],
      }
    }
    const numLines = sourceCode.match(/\n/g)?.length ?? 0 + 1
    if (!parser || !query) {
      throw new Error('Parser or query not found')
    }
    const parseResults = parseFile(parser, query, sourceCode)
    const identifiers = Array.from(new Set(parseResults.identifier))
    const calls = Array.from(new Set(parseResults['call.identifier']))

    if (DEBUG_PARSING) {
      console.log(`\nParsing ${filePath}:`)
      console.log('Identifiers:', identifiers)
      console.log('Calls:', calls)
    }

    return {
      numLines,
      identifiers: identifiers ?? [],
      calls: calls ?? [],
    }
  } catch (e) {
    if (DEBUG_PARSING) {
      console.error(`Error parsing query: ${e}`)
      console.log(filePath)
    }
    return {
      numLines: 0,
      identifiers: [] as string[],
      calls: [] as string[],
    }
  }
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
}
