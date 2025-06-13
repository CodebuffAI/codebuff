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

export async function getLanguageConfig(
  filePath: string
): Promise<LanguageConfig | undefined> {
  // Load tree-sitter dynamically
  const TreeSitterModule = await TreeSitter();
  
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

      const query = new TreeSitterModule.Query(parser.getLanguage(), config.queryString)

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
