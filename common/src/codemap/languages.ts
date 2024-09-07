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

interface LanguageConfig {
  language: any
  extensions: string[]
  queryFile: string
}

const languageConfigs: LanguageConfig[] = [
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
  return languageConfigs.find((config) => config.extensions.includes(extension))
}
