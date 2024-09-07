import * as fs from 'fs'
import * as path from 'path'
import Parser from 'tree-sitter'

import { getLanguageConfig } from './languages'

const parser = new Parser()
const { Query } = Parser

export function getFileTokenScores(projectRoot: string, filePaths: string[]) {
  const tokenScores: { [filePath: string]: { [token: string]: number } } = {}
  const externalCalls: { [token: string]: number } = {}

  for (const filePath of filePaths) {
    const fullPath = path.join(projectRoot, filePath)
    const dirs = path.dirname(fullPath).split(path.sep)
    const depth = dirs.length
    if (
      fs.existsSync(fullPath) &&
      fs.statSync(fullPath).isFile() &&
      !!getLanguageConfig(fullPath)
    ) {
      const { identifiers, calls, numLines } = parseTokens(fullPath)
      console.log(identifiers)

      const tokenScoresForFile: { [token: string]: number } = {}
      tokenScores[filePath] = tokenScoresForFile

      const tokenBaseScore =
        0.8 ** depth * Math.sqrt(numLines / (identifiers.length + 1))

      for (const identifier of identifiers) {
        tokenScoresForFile[identifier] = tokenBaseScore
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
      scores[token] *= 1 + Math.log(1 + numCalls)
    }
  }

  return tokenScores
}

export function parseTokens(filePath: string) {
  const languageConfig = getLanguageConfig(filePath)
  if (!languageConfig) {
    console.warn(`Unsupported file type: ${filePath}`)
    return {
      numLines: 0,
      identifiers: [] as string[],
      calls: [] as string[],
    }
  }

  parser.setLanguage(languageConfig.language)

  const queryFilePath = path.join(
    __dirname,
    'tree-sitter-queries',
    languageConfig.queryFile
  )
  const queryString = fs.readFileSync(queryFilePath, 'utf8')
  try {
    const query = new Query(parser.getLanguage(), queryString)
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
    console.error(`Error parsing query: ${e}`)
    console.log(filePath)
    return {
      numLines: 0,
      identifiers: [] as string[],
      calls: [] as string[],
    }
  }
}

function parseFile(
  parser: Parser,
  query: Parser.Query,
  sourceCode: string
): { [key: string]: string[] } {
  const tree = parser.parse(sourceCode)
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
