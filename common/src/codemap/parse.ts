import * as fs from 'fs'
import * as path from 'path'
import Parser from 'tree-sitter'

import { getLanguageConfig } from './languages'

const parser = new Parser()
const { Query } = Parser

export function getExportedTokens(filePaths: string[]): {
  [key: string]: string[]
} {
  const results: { [key: string]: string[] } = {}

  for (const filePath of filePaths) {
    if (
      fs.existsSync(filePath) &&
      fs.statSync(filePath).isFile() &&
      !!getLanguageConfig(filePath)
    ) {
      const fileResults = parseExportedTokens(filePath)
      console.log('fileResults', fileResults)
      Object.keys(fileResults).forEach((key) => {
        if (!results[key]) {
          results[key] = []
        }
        results[key].push(...fileResults[key])
      })
    }
  }

  console.log('results', results)
  return results
}

export function parseExportedTokens(filePath: string): {
  [key: string]: string[]
} {
  const languageConfig = getLanguageConfig(filePath)
  if (!languageConfig) {
    console.warn(`Unsupported file type: ${filePath}`)
    return {}
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
    return parseFile(filePath, parser, query)
  } catch (e) {
    console.error(`Error parsing query: ${e}`)
    console.log(filePath)
    return {}
  }
}

function parseFile(
  filePath: string,
  parser: Parser,
  query: Parser.Query
): { [key: string]: string[] } {
  const sourceCode = fs.readFileSync(filePath, 'utf8')
  const tree = parser.parse(sourceCode)

  const captures = query.captures(tree.rootNode)
  const result: { [key: string]: string[] } = {}

  captures.forEach((capture) => {
    const { name, node } = capture
    if (!result[name]) {
      result[name] = []
    }
    result[name].push(
      `${node.text} (${filePath}:${node.startPosition.row + 1}:${node.startPosition.column + 1})`
    )
  })

  return result
}
