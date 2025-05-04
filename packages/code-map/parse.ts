import * as fs from 'fs'
import * as path from 'path'
import Parser from 'tree-sitter'
import { uniq } from 'lodash'

import { getLanguageConfig } from './languages'

export const DEBUG_PARSING = false
const IGNORE_TOKENS = ['__init__', '__post_init__', '__call__', 'constructor']

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
  filePaths: string[]
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
      const { identifiers, calls, numLines } = await parseTokens(fullPath)

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

  // Initialize tokenCallers only for files that define tokens
  const tokenCallers: TokenCallerMap = {}
  for (const [filePath, scores] of Object.entries(tokenScores)) {
    if (Object.keys(scores).length > 0) {
      tokenCallers[filePath] = {}
      for (const token of Object.keys(scores)) {
        tokenCallers[filePath][token] = []
      }
    }
  }

  // For each file's calls, add it as a caller to the defining file's tokens
  for (const [callingFile, calls] of fileCallsMap.entries()) {
    for (const call of calls) {
      const definingFile = tokenDefinitionMap.get(call)
      if (definingFile && tokenCallers[definingFile]) {
        if (!tokenCallers[definingFile][call]) {
          tokenCallers[definingFile][call] = []
        }
        if (
          !tokenCallers[definingFile][call].includes(callingFile) &&
          callingFile !== definingFile
        ) {
          tokenCallers[definingFile][call].push(callingFile)
        }
      }
    }
  }

  // Apply call frequency boost to token scores
  for (const scores of Object.values(tokenScores)) {
    for (const token of Object.keys(scores)) {
      const numCalls = externalCalls[token] ?? 0
      if (typeof numCalls !== 'number') continue
      scores[token] *= 1 + Math.log(1 + numCalls)
    }
  }

  if (DEBUG_PARSING) {
    const endTime = Date.now()
    console.log(`Parsed ${filePaths.length} files in ${endTime - startTime}ms`)

    console.log('externalCalls', externalCalls)
    console.log('tokenCallers', tokenCallers)
    console.log('tokenScores', tokenScores)
    console.log('fileCallsMap', Object.fromEntries(fileCallsMap))
  }

  return { tokenScores, tokenCallers }
}

export async function parseTokens(filePath: string) {
  const languageConfig = await getLanguageConfig(filePath)
  if (languageConfig) {
    const { parser, query } = languageConfig

    try {
      const sourceCode = fs.readFileSync(filePath, 'utf8')
      const numLines = sourceCode.match(/\n/g)?.length ?? 0 + 1
      const parseResults = parseFile(parser, query, sourceCode)
      const identifiers = uniq(parseResults.identifier)
      const calls = uniq(parseResults['call.identifier'])

      if (DEBUG_PARSING) {
        console.log(`\nParsing ${filePath}:`)
        console.log('Source:', sourceCode)
        console.log('Parse results:', parseResults)
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
    }
  }
  return {
    numLines: 0,
    identifiers: [] as string[],
    calls: [] as string[],
  }
}

function parseFile(
  parser: Parser,
  query: Parser.Query,
  sourceCode: string
): { [key: string]: string[] } {
  const tree = parser.parse(sourceCode, undefined, {
    bufferSize: 1024 * 1024,
  })
  const captures = query.captures(tree.rootNode)
  const result: { [key: string]: string[] } = {}

  if (DEBUG_PARSING) {
    console.log('\nCaptures:', captures)
  }

  for (const capture of captures) {
    const { name, node } = capture
    if (!result[name]) {
      result[name] = []
    }
    result[name].push(node.text)
  }

  return result
}
