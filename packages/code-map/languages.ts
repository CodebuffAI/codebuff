import * as fs from 'fs'
import * as path from 'path'
import Parser from 'tree-sitter'
import { Query } from 'tree-sitter'
import { spawn } from 'child_process'

import { DEBUG_PARSING } from './parse'

interface LanguageConfig {
  language: any
  extensions: string[]
  packageName: string
  queryFile: string
  parser: Parser
  query: Query
}

enum LoaderState {
  IDLE = 'idle',
  LOADING = 'loading',
  LOADED = 'loaded',
  FAILED = 'failed',
}

interface LanguageLoader {
  language?: any
  parser?: Parser
  query?: Query
  state: LoaderState
  error?: Error
  lastAttempt?: number
  loadPromise?: Promise<LanguageConfig | undefined>
}

const languageLoaders: Record<string, LanguageLoader> = {}

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

export function findGlobalCodecaneDir(): string {
  const packagePath = path.resolve(__dirname, '..', '..')
  if (fs.existsSync(path.join(packagePath, 'package.json'))) {
    return packagePath
  }

  // Try to find package.json in parent directories
  let currentDir = packagePath
  const rootDir = path.parse(currentDir).root

  while (currentDir !== rootDir) {
    currentDir = path.dirname(currentDir)
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir
    }
  }

  throw new Error('Could not find package.json in any parent directory')
}

function detectPackageManager(globalDir: string): {
  command: string
  args: string[]
} {
  // Add special case for our development environment.
  // Note (James): It's still not actually installing the package in npm-app/node_modules.
  // Could be something with workspaces?
  const isRunningLocally =
    path.basename(path.join(__dirname, '..', '..')) === 'npm-app'
  if (isRunningLocally) {
    return { command: 'bun', args: ['install'] }
  }

  // First check environment variables for scripts running through specific package managers
  const isYarnScript = process.env.npm_lifecycle_script?.includes('yarn')
  const isPnpmScript = process.env.npm_lifecycle_script?.includes('pnpm')
  const isBunScript = process.env.npm_lifecycle_script?.includes('bun')

  // Then check for lock files
  const hasBunLock =
    fs.existsSync(path.join(globalDir, 'bun.lockb')) ||
    fs.existsSync(path.join(globalDir, 'bun.lock'))
  const hasPnpmLock = fs.existsSync(path.join(globalDir, 'pnpm-lock.yaml'))
  const hasYarnLock = fs.existsSync(path.join(globalDir, 'yarn.lock'))

  // Determine package manager and args
  if (isBunScript || hasBunLock) {
    return { command: 'bun', args: ['install'] }
  } else if (isPnpmScript || hasPnpmLock) {
    return { command: 'pnpm', args: ['install'] }
  } else if (isYarnScript || hasYarnLock) {
    return { command: 'yarn', args: ['add'] }
  } else {
    // Default to npm with the legacy-peer-deps flag
    return { command: 'npm', args: ['install', '--legacy-peer-deps'] }
  }
}

async function installPackage(
  packageName: string,
  packageVersion: string
): Promise<boolean> {
  try {
    const globalDir = findGlobalCodecaneDir()
    const { command, args } = detectPackageManager(globalDir)

    // Add package with version to arguments
    const fullArgs = [...args, `${packageName}@${packageVersion}`]

    if (DEBUG_PARSING) {
      console.log(
        `Installing ${packageName}@${packageVersion} using ${command}...`
      )
    }

    return new Promise((resolve) => {
      const install = spawn(command, fullArgs, {
        stdio: DEBUG_PARSING ? 'inherit' : 'ignore',
        cwd: globalDir,
        env: { ...process.env, PWD: globalDir },
      })

      install.on('error', (error) => {
        if (DEBUG_PARSING) {
          console.error(`Package manager execution error: ${error.message}`)
        }
        resolve(false)
      })

      install.on('close', (code) => {
        const success = code === 0
        if (DEBUG_PARSING && !success) {
          console.error(`${command} exited with code ${code}`)
        }
        resolve(success)
      })
    })
  } catch (error) {
    if (DEBUG_PARSING) {
      console.error('Error during package installation:', error)
    }
    return false
  }
}

function getLanguageFromModule(languageModule: any, extension: string): any {
  switch (extension) {
    case '.ts':
      return languageModule.typescript
    case '.tsx':
      return languageModule.tsx
    case '.php':
      return languageModule.php
    default:
      return languageModule
  }
}

async function loadLanguage(
  packageName: string,
  extension: string
): Promise<{ language: any; parser: Parser; query: Query }> {
  const MAX_INSTALL_ATTEMPTS = 2

  for (let attempt = 0; attempt < MAX_INSTALL_ATTEMPTS; attempt++) {
    try {
      const codecaneDir = findGlobalCodecaneDir()
      const packagePath = path.join(codecaneDir, 'node_modules', packageName)

      // Try to load the module
      const module = await import(packagePath)
      const languageModule = module.default || module

      // Create parser and set language
      const parser = new Parser()
      const language = getLanguageFromModule(languageModule, extension)
      parser.setLanguage(language)

      // Load query file
      const config = languageConfigs.find((c) =>
        c.extensions.includes(extension)
      )
      if (!config) {
        throw new Error(`No language config found for extension: ${extension}`)
      }

      const queryFilePath = path.join(
        __dirname,
        'tree-sitter-queries',
        config.queryFile
      )

      try {
        const queryString = fs.readFileSync(queryFilePath, 'utf8')
        const query = new Query(parser.getLanguage(), queryString)
        return { language: languageModule, parser, query }
      } catch (error) {
        if (DEBUG_PARSING) {
          console.error(`Error loading query file ${queryFilePath}:`, error)
        }
        throw error
      }
    } catch (error) {
      // Log the specific error for debugging
      if (DEBUG_PARSING) {
        console.error(
          `Attempt ${attempt + 1} loading ${packageName} failed:`,
          error
        )
      }

      // Only try to install if we haven't reached the max attempts
      if (attempt < MAX_INSTALL_ATTEMPTS - 1) {
        const installed = await installPackage(packageName, '^0.23.0')
        if (!installed) {
          throw new Error(
            `Failed to install ${packageName}: Installation process failed`
          )
        }
      } else {
        throw error // Re-throw on last attempt
      }
    }
  }

  // This should never be reached due to the throw in the loop, but TypeScript needs it
  throw new Error(
    `Failed to load ${packageName} after ${MAX_INSTALL_ATTEMPTS} attempts`
  )
}

async function loadLanguageConfig(
  config: Omit<LanguageConfig, 'parser' | 'query' | 'language'>,
  extension: string
): Promise<LanguageConfig | undefined> {
  const packageName = config.packageName
  const loader = languageLoaders[packageName]

  try {
    const { language, parser, query } = await loadLanguage(
      packageName,
      extension
    )

    // Update loader state
    loader.state = LoaderState.LOADED
    loader.language = language
    loader.parser = parser
    loader.query = query
    loader.error = undefined
    loader.lastAttempt = Date.now()

    return {
      ...config,
      language,
      parser,
      query,
    }
  } catch (error) {
    // Update loader state on failure
    loader.state = LoaderState.FAILED
    loader.error = error as Error
    loader.lastAttempt = Date.now()

    if (DEBUG_PARSING) {
      console.error(
        `Failed to load language for ${extension} (${packageName}):`,
        error
      )
    }

    return undefined
  }
}

export async function getLanguageConfig(
  filePath: string
): Promise<LanguageConfig | undefined> {
  const extension = path.extname(filePath)

  // Find the language config for this extension
  const config = languageConfigs.find((config) =>
    config.extensions.includes(extension)
  )

  if (!config) {
    return undefined
  }

  // Use or initialize the language loader
  const packageName = config.packageName
  if (!languageLoaders[packageName]) {
    languageLoaders[packageName] = { state: LoaderState.IDLE }
  }

  const loader = languageLoaders[packageName]

  // If the loader is already loaded, return the configuration
  if (
    loader.state === LoaderState.LOADED &&
    loader.language &&
    loader.parser &&
    loader.query
  ) {
    return {
      ...config,
      language: loader.language,
      parser: loader.parser,
      query: loader.query,
    }
  }

  if (loader.state === LoaderState.FAILED) {
    return undefined
  }

  // If already loading, wait for the existing load process
  if (loader.state === LoaderState.LOADING && loader.loadPromise) {
    return loader.loadPromise
  }

  // Start loading the language
  loader.state = LoaderState.LOADING
  loader.loadPromise = loadLanguageConfig(config, extension)

  try {
    const result = await loader.loadPromise
    return result
  } finally {
    // Clear the promise reference after it resolves
    loader.loadPromise = undefined
  }
}
