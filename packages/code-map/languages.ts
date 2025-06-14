import * as path from 'path'
import { DEBUG_PARSING } from './parse'

/*
// require('tree-sitter/prebuilds/linux-x64/tree-sitter.node')
// require('tree-sitter/prebuilds/linux-arm64/tree-sitter.node')
// require('tree-sitter/prebuilds/darwin-x64/tree-sitter.node')
require('tree-sitter/prebuilds/darwin-arm64/tree-sitter.node')
// require('tree-sitter/prebuilds/win32-x64/tree-sitter.node')
// require('tree-sitter/prebuilds/win32-arm64/tree-sitter.node')

// Language-specific bindings
// require('tree-sitter-c/prebuilds/linux-x64/tree-sitter-c.node')
// require('tree-sitter-c/prebuilds/darwin-x64/tree-sitter-c.node')
require('tree-sitter-c/prebuilds/darwin-arm64/tree-sitter-c.node')
// require('tree-sitter-c/prebuilds/win32-x64/tree-sitter-c.node')

// require('tree-sitter-c-sharp/prebuilds/linux-x64/tree-sitter-c-sharp.node')
// require('tree-sitter-c-sharp/prebuilds/darwin-x64/tree-sitter-c-sharp.node')
require('tree-sitter-c-sharp/prebuilds/darwin-arm64/tree-sitter-c-sharp.node')
// require('tree-sitter-c-sharp/prebuilds/win32-x64/tree-sitter-c-sharp.node')

// require('tree-sitter-cpp/prebuilds/linux-x64/tree-sitter-cpp.node')
// require('tree-sitter-cpp/prebuilds/darwin-x64/tree-sitter-cpp.node')
require('tree-sitter-cpp/prebuilds/darwin-arm64/tree-sitter-cpp.node')
// require('tree-sitter-cpp/prebuilds/win32-x64/tree-sitter-cpp.node')

// require('tree-sitter-go/prebuilds/linux-x64/tree-sitter-go.node')
// require('tree-sitter-go/prebuilds/darwin-x64/tree-sitter-go.node')
require('tree-sitter-go/prebuilds/darwin-arm64/tree-sitter-go.node')
// require('tree-sitter-go/prebuilds/win32-x64/tree-sitter-go.node')

// require('tree-sitter-java/prebuilds/linux-x64/tree-sitter-java.node')
// require('tree-sitter-java/prebuilds/darwin-x64/tree-sitter-java.node')
require('tree-sitter-java/prebuilds/darwin-arm64/tree-sitter-java.node')
// require('tree-sitter-java/prebuilds/win32-x64/tree-sitter-java.node')

// require('tree-sitter-javascript/prebuilds/linux-x64/tree-sitter-javascript.node')
// require('tree-sitter-javascript/prebuilds/darwin-x64/tree-sitter-javascript.node')
require('tree-sitter-javascript/prebuilds/darwin-arm64/tree-sitter-javascript.node')
// require('tree-sitter-javascript/prebuilds/win32-x64/tree-sitter-javascript.node')

// require('tree-sitter-php/prebuilds/linux-x64/tree-sitter-php.node')
// require('tree-sitter-php/prebuilds/darwin-x64/tree-sitter-php.node')
require('tree-sitter-php/prebuilds/darwin-arm64/tree-sitter-php.node')
// require('tree-sitter-php/prebuilds/win32-x64/tree-sitter-php.node')

// require('tree-sitter-python/prebuilds/linux-x64/tree-sitter-python.node')
// require('tree-sitter-python/prebuilds/darwin-x64/tree-sitter-python.node')
require('tree-sitter-python/prebuilds/darwin-arm64/tree-sitter-python.node')
// require('tree-sitter-python/prebuilds/win32-x64/tree-sitter-python.node')

// require('tree-sitter-ruby/prebuilds/linux-x64/tree-sitter-ruby.node')
// require('tree-sitter-ruby/prebuilds/darwin-x64/tree-sitter-ruby.node')
require('tree-sitter-ruby/prebuilds/darwin-arm64/tree-sitter-ruby.node')
// require('tree-sitter-ruby/prebuilds/win32-x64/tree-sitter-ruby.node')

// require('tree-sitter-rust/prebuilds/linux-x64/tree-sitter-rust.node')
// require('tree-sitter-rust/prebuilds/darwin-x64/tree-sitter-rust.node')
require('tree-sitter-rust/prebuilds/darwin-arm64/tree-sitter-rust.node')
// require('tree-sitter-rust/prebuilds/win32-x64/tree-sitter-rust.node')

// require('tree-sitter-typescript/prebuilds/linux-x64/tree-sitter-typescript.node')
// require('tree-sitter-typescript/prebuilds/darwin-x64/tree-sitter-typescript.node')
require('tree-sitter-typescript/prebuilds/darwin-arm64/tree-sitter-typescript.node')
// require('tree-sitter-typescript/prebuilds/win32-x64/tree-sitter-typescript.node')
*/

import Parser from 'tree-sitter'
import { Query } from 'tree-sitter'
// Import query files as static strings
import cQuery from './tree-sitter-queries/tree-sitter-c-tags.scm'
import cppQuery from './tree-sitter-queries/tree-sitter-cpp-tags.scm'
import csharpQuery from './tree-sitter-queries/tree-sitter-c_sharp-tags.scm'
import goQuery from './tree-sitter-queries/tree-sitter-go-tags.scm'
import javaQuery from './tree-sitter-queries/tree-sitter-java-tags.scm'
import javascriptQuery from './tree-sitter-queries/tree-sitter-javascript-tags.scm'
import phpQuery from './tree-sitter-queries/tree-sitter-php-tags.scm'
import pythonQuery from './tree-sitter-queries/tree-sitter-python-tags.scm'
import rubyQuery from './tree-sitter-queries/tree-sitter-ruby-tags.scm'
import rustQuery from './tree-sitter-queries/tree-sitter-rust-tags.scm'
import typescriptQuery from './tree-sitter-queries/tree-sitter-typescript-tags.scm'

// Static imports for all tree-sitter language modules
import treeSitterC from 'tree-sitter-c'
import treeSitterCSharp from 'tree-sitter-c-sharp'
import treeSitterCpp from 'tree-sitter-cpp'
import treeSitterGo from 'tree-sitter-go'
import treeSitterJava from 'tree-sitter-java'
import treeSitterJavascript from 'tree-sitter-javascript'
import treeSitterPhp from 'tree-sitter-php'
import treeSitterPython from 'tree-sitter-python'
import treeSitterRuby from 'tree-sitter-ruby'
import treeSitterRust from 'tree-sitter-rust'
import treeSitterTypescript from 'tree-sitter-typescript'

export interface LanguageConfig {
  language: any
  extensions: string[]
  packageName: string
  queryString: string
  parser: any
  query: any
  // TODO: Bring back the Tree sitter types
}

const languageConfigs: Omit<LanguageConfig, 'parser' | 'query' | 'language'>[] =
  [
    {
      extensions: ['.ts'],
      queryString: typescriptQuery,
      packageName: 'tree-sitter-typescript',
    },
    {
      extensions: ['.tsx'],
      queryString: typescriptQuery,
      packageName: 'tree-sitter-typescript',
    },
    {
      extensions: ['.js', '.jsx'],
      queryString: javascriptQuery,
      packageName: 'tree-sitter-javascript',
    },
    {
      extensions: ['.py'],
      queryString: pythonQuery,
      packageName: 'tree-sitter-python',
    },
    {
      extensions: ['.java'],
      queryString: javaQuery,
      packageName: 'tree-sitter-java',
    },
    {
      extensions: ['.cs'],
      queryString: csharpQuery,
      packageName: 'tree-sitter-c-sharp',
    },
    {
      extensions: ['.c', '.h'],
      queryString: cQuery,
      packageName: 'tree-sitter-c',
    },
    {
      extensions: ['.cpp', '.hpp'],
      queryString: cppQuery,
      packageName: 'tree-sitter-cpp',
    },
    {
      extensions: ['.rs'],
      queryString: rustQuery,
      packageName: 'tree-sitter-rust',
    },
    {
      extensions: ['.rb'],
      queryString: rubyQuery,
      packageName: 'tree-sitter-ruby',
    },
    {
      extensions: ['.go'],
      queryString: goQuery,
      packageName: 'tree-sitter-go',
    },
    {
      extensions: ['.php'],
      queryString: phpQuery,
      packageName: 'tree-sitter-php',
    },
  ]

// Map package names to their statically imported modules
const languageModules: Record<string, any> = {
  'tree-sitter-c': treeSitterC,
  'tree-sitter-c-sharp': treeSitterCSharp,
  'tree-sitter-cpp': treeSitterCpp,
  'tree-sitter-go': treeSitterGo,
  'tree-sitter-java': treeSitterJava,
  'tree-sitter-javascript': treeSitterJavascript,
  'tree-sitter-php': treeSitterPhp.php,
  'tree-sitter-python': treeSitterPython,
  'tree-sitter-ruby': treeSitterRuby,
  'tree-sitter-rust': treeSitterRust,
  'tree-sitter-typescript': treeSitterTypescript,
}

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

    const languageModule = languageModules[config.packageName]
    if (!languageModule) {
      if (DEBUG_PARSING) {
        console.log('Language module not found:', config.packageName)
      }
      return undefined
    }

    try {
      const language =
        extension === '.ts'
          ? languageModule.typescript
          : extension === '.tsx'
            ? languageModule.tsx
            : extension === '.php'
              ? languageModule.php
              : languageModule
      parser.setLanguage(language)

      const query = new Query(parser.getLanguage(), config.queryString)

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
