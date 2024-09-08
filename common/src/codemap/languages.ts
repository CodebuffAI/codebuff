import * as fs from 'fs'
import * as path from 'path'
import TypeScriptLanguage from 'tree-sitter-typescript'
import JavaScriptLanguage from 'tree-sitter-javascript'
import PythonLanguage from 'tree-sitter-python'
import RubyLanguage from 'tree-sitter-ruby'
import GoLanguage from 'tree-sitter-go'
import JavaLanguage from 'tree-sitter-java'
import CSharpLanguage from 'tree-sitter-c-sharp'
import CPPLanguage from 'tree-sitter-cpp'
import PHPLanguage from 'tree-sitter-php'
import RustLanguage from 'tree-sitter-rust'
import Parser from 'tree-sitter'
import { Query } from 'tree-sitter'

interface LanguageConfig {
  language: any
  extensions: string[]
  queryFile: string
  parser: Parser
  query: Query
}

const languageConfigs: Omit<LanguageConfig, 'parser' | 'query'>[] = [
  {
    language: TypeScriptLanguage.typescript,
    extensions: ['.ts', '.tsx'],
    queryFile: 'tree-sitter-typescript-tags.scm',
  },
  {
    language: JavaScriptLanguage,
    extensions: ['.js', '.jsx'],
    queryFile: 'tree-sitter-javascript-tags.scm',
  },
  {
    language: PythonLanguage,
    extensions: ['.py'],
    queryFile: 'tree-sitter-python-tags.scm',
  },
  {
    language: RubyLanguage,
    extensions: ['.rb'],
    queryFile: 'tree-sitter-ruby-tags.scm',
  },
  {
    language: GoLanguage,
    extensions: ['.go'],
    queryFile: 'tree-sitter-go-tags.scm',
  },
  {
    language: JavaLanguage,
    extensions: ['.java'],
    queryFile: 'tree-sitter-java-tags.scm',
  },
  {
    language: CSharpLanguage,
    extensions: ['.cs'],
    queryFile: 'tree-sitter-c_sharp-tags.scm',
  },
  {
    language: CPPLanguage,
    extensions: ['.cpp', '.hpp', '.c', '.h'],
    queryFile: 'tree-sitter-cpp-tags.scm',
  },
  {
    language: PHPLanguage,
    extensions: ['.php'],
    queryFile: 'tree-sitter-php-tags.scm',
  },
  {
    language: RustLanguage,
    extensions: ['.rs'],
    queryFile: 'tree-sitter-rust-tags.scm',
  },
]

export function getLanguageConfig(
  filePath: string
): LanguageConfig | undefined {
  const extension = path.extname(filePath)
  const config = languageConfigs.find((config) =>
    config.extensions.includes(extension)
  ) as LanguageConfig | undefined
  if (!config) return undefined

  if (!config.parser) {
    const parser = new Parser()
    parser.setLanguage(config.language)

    try {
      const queryFilePath = path.join(
        __dirname,
        'tree-sitter-queries',
        config.queryFile
      )
      const queryString = fs.readFileSync(queryFilePath, 'utf8')
      config.query = new Query(parser.getLanguage(), queryString)
      config.parser = parser
    } catch (e) {
      return undefined
    }
  }

  return config
}
