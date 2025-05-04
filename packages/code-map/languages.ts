import * as fs from 'fs'
import * as path from 'path'
import Parser from 'tree-sitter'
import { Query } from 'tree-sitter'

import { DEBUG_PARSING } from './parse'

export interface LanguageConfig {
  language: any
  extensions: string[]
  packageName: string
  queryFile: string
  parser: Parser
  query: Query
}

const languageConfigs: Omit<LanguageConfig, 'parser' | 'query' | 'language'>[] =
  [
    {
      extensions: ['.ts'],
      queryFile: 'tree-sitter-typescript-tags.scm',
      packageName: 'tree-sitter-typescript',
    },
    {
      extensions: ['.tsx'],
      queryFile: 'tree-sitter-typescript-tags.scm',
      packageName: 'tree-sitter-typescript',
    },
    {
      extensions: ['.js', '.jsx'],
      queryFile: 'tree-sitter-javascript-tags.scm',
      packageName: 'tree-sitter-javascript',
    },
    {
      extensions: ['.py'],
      queryFile: 'tree-sitter-python-tags.scm',
      packageName: 'tree-sitter-python',
    },
    {
      extensions: ['.java'],
      queryFile: 'tree-sitter-java-tags.scm',
      packageName: 'tree-sitter-java',
    },
    {
      extensions: ['.cs'],
      queryFile: 'tree-sitter-c_sharp-tags.scm',
      packageName: 'tree-sitter-c-sharp',
    },
    {
      extensions: ['.c', '.h'],
      queryFile: 'tree-sitter-c-tags.scm',
      packageName: 'tree-sitter-c',
    },
    {
      extensions: ['.cpp', '.hpp'],
      queryFile: 'tree-sitter-cpp-tags.scm',
      packageName: 'tree-sitter-cpp',
    },
    {
      extensions: ['.rs'],
      queryFile: 'tree-sitter-rust-tags.scm',
      packageName: 'tree-sitter-rust',
    },
    {
      extensions: ['.rb'],
      queryFile: 'tree-sitter-ruby-tags.scm',
      packageName: 'tree-sitter-ruby',
    },
    {
      extensions: ['.go'],
      queryFile: 'tree-sitter-go-tags.scm',
      packageName: 'tree-sitter-go',
    },
    {
      extensions: ['.php'],
      queryFile: 'tree-sitter-php-tags.scm',
      packageName: 'tree-sitter-php',
    },
  ]

export async function getLanguageConfig(
  filePath: string
): Promise<LanguageConfig | undefined> {
  const extension = path.extname(filePath)
  const config = languageConfigs.find((config) =>
    config.extensions.includes(extension)
  ) as LanguageConfig | undefined
  if (!config) return undefined

  if (!config.parser) {
    const parser = new Parser()

    try {
      const languageModule = await import(config.packageName)
      const language =
        extension === '.ts'
          ? languageModule.typescript
          : extension === '.tsx'
            ? languageModule.tsx
            : extension === '.php'
              ? languageModule.php
              : languageModule
      parser.setLanguage(language)

      const queryFilePath = path.join(
        __dirname,
        'tree-sitter-queries',
        config.queryFile
      )
      const queryString = fs.readFileSync(queryFilePath, 'utf8')
      const query = new Query(parser.getLanguage(), queryString)

      config.parser = parser
      config.query = query
      config.language = language
    } catch (e) {
      if (DEBUG_PARSING) {
        console.log('error', filePath, e)
      }
      return undefined
    }
  }

  return config
}
