import * as fs from 'fs'
import * as path from 'path'
import Parser from 'tree-sitter'

import { getLanguageConfig } from './languages'

export const DEBUG_PARSING = false
const IGNORE_TOKENS = ['__init__', '__post_init__', '__call__', 'constructor']

export async function getFileTokenScores(projectRoot: string, filePaths: string[]) {
  const startTime = Date.now()
  const tokenScores: { [filePath: string]: { [token: string]: number } } = {}
  const externalCalls: { [token: string]: number } = {}

  for (const filePath of filePaths) {
    const fullPath = path.join(projectRoot, filePath)
    if (!!getLanguageConfig(fullPath)) {
      const { identifiers, calls, numLines } = await parseTokens(fullPath)

      const tokenScoresForFile: { [token: string]: number } = {}
      tokenScores[filePath] = tokenScoresForFile

      const dirs = path.dirname(fullPath).split(path.sep)
      const depth = dirs.length
      const tokenBaseScore =
        0.8 ** depth * Math.sqrt(numLines / (identifiers.length + 1))

      for (const identifier of identifiers) {
        if (!IGNORE_TOKENS.includes(identifier)) {
          tokenScoresForFile[identifier] = tokenBaseScore
        }
      }
      for (const call of calls) {
        if (!tokenScoresForFile[call]) {
          externalCalls[call] = (externalCalls[call] ?? 0) + 1
        }
      }
    }
  }

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

    // Save exportedTokens to a file
    const exportedTokensFilePath = path.join(
      projectRoot,
      'exported-tokens.json'
    )
    try {
      fs.writeFileSync(
        exportedTokensFilePath,
        JSON.stringify(tokenScores, null, 2)
      )
      console.log(`Exported tokens saved to ${exportedTokensFilePath}`)
    } catch (error) {
      console.error(`Failed to save exported tokens to file: ${error}`)
    }
  }

  return tokenScores
}

export async function parseTokens(filePath: string) {
  const languageConfig = await getLanguageConfig(filePath)
  if (languageConfig) {
    const { parser, query } = languageConfig

    try {
      const sourceCode = fs.readFileSync(filePath, 'utf8')
      const numLines = sourceCode.match(/\n/g)?.length ?? 0 + 1
      const parseResults = parseFile(parser, query, sourceCode)
      const identifiers = parseResults.identifier
      const calls = parseResults['call.identifier']
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

  for (const capture of captures) {
    const { name, node } = capture
    if (!result[name]) {
      result[name] = []
    }
    result[name].push(node.text)
  }

  return result
}
