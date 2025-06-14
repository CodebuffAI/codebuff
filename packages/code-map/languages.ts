import * as path from 'path'
import TreeSitter from './native/tree-sitter'

import { DEBUG_PARSING } from './parse'

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
  // Load tree-sitter dynamically
  const TreeSitterModule = await TreeSitter()

  // If tree-sitter is not available, return undefined
  if (!TreeSitterModule) {
    return undefined
  }

  const extension = path.extname(filePath)
  const config = languageConfigs.find((config) =>
    config.extensions.includes(extension)
  ) as LanguageConfig | undefined
  if (!config) return undefined

  if (!config.parser) {
    const parser = new TreeSitterModule()

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

      const query = new TreeSitterModule.Query(
        parser.getLanguage(),
        config.queryString
      )

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
