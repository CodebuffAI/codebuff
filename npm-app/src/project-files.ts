import { exec } from 'child_process'
import fs, { existsSync, statSync } from 'fs'
import os from 'os'
import path, { isAbsolute } from 'path'
import { promisify } from 'util'
import { Worker } from 'worker_threads'

import { getFileTokenScores } from 'code-map/parse'
import { FILE_READ_STATUS, toOptionalFile } from 'common/constants'
import {
  flattenTree,
  getProjectFileTree,
  parseGitignore,
} from 'common/project-file-tree'
import {
  createWriteFileBlock,
  ensureDirectoryExists,
  ProjectFileContext,
} from 'common/util/file'
import { filterObject } from 'common/util/object'
import { createPatch } from 'diff'
import { green } from 'picocolors'

import {
  codebuffConfigFile,
  codebuffConfigFileBackup,
} from 'common/json-config/constants'
import { checkpointManager } from './checkpoints/checkpoint-manager'
import { CONFIG_DIR } from './credentials'
import { logger } from './utils/logger'
import { getSystemInfo } from './utils/system-info'
import { getScrapedContentBlocks, parseUrlsFromContent } from './web-scraper'

// Global variables for chat management
// Initialize chat ID on first import
let currentChatId = new Date().toISOString().replace(/:/g, '-')

export function getCurrentChatId() {
  return currentChatId
}

export function startNewChat() {
  currentChatId = new Date().toISOString().replace(/:/g, '-')
  return currentChatId
}

export function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

// Get the project-specific data directory
export function getProjectDataDir(): string {
  const root = getProjectRoot()
  if (!root) {
    throw new Error('Project root not set. Call setProjectRoot() first.')
  }

  const baseName = path.basename(root)
  const baseDir = path.join(CONFIG_DIR, 'projects', baseName)

  // TODO: Need to handle duplicate project directories after adding automatic
  // feedback feature
  return baseDir
}

export function getCurrentChatDir(): string {
  const dir = path.join(getProjectDataDir(), 'chats', getCurrentChatId())
  ensureDirectoryExists(dir)
  return dir
}

const execAsync = promisify(exec)

let projectRoot: string

export function setProjectRoot(dir: string, setCwd: boolean = false) {
  if (existsSync(dir)) {
    if (projectRoot && projectRoot !== dir) {
      checkpointManager.clearCheckpoints(true)

      console.log(
        '\n' + green('Directory change:'),
        `Codebuff will read and write files in "${dir}".\n`
      )
    }
    projectRoot = dir
    if (setCwd) {
      setWorkingDirectory(dir)
    }
    return dir
  }
  if (setCwd) {
    setWorkingDirectory(projectRoot)
  }
  return projectRoot
}

export function getProjectRoot() {
  return projectRoot
}

let workingDirectory: string
export function setWorkingDirectory(dir: string) {
  workingDirectory = dir
  return workingDirectory
}

export function getWorkingDirectory() {
  return workingDirectory
}

export function getStartingDirectory(dir: string | undefined = undefined): {
  cwd: string
  shouldSearch: boolean
} {
  let base
  try {
    base = process.cwd()
  } catch (error) {
    throw new Error(
      'Failed to get current working directory. Is this directory deleted?',
      { cause: error }
    )
  }
  if (!dir) {
    return { cwd: base, shouldSearch: true }
  }
  const dirAbsolute = path.normalize(path.resolve(base, dir))
  if (!existsSync(dirAbsolute) || !statSync(dirAbsolute).isDirectory()) {
    console.log(`Could not find directory ${dirAbsolute}\n`)
    return { cwd: base, shouldSearch: true }
  }
  return { cwd: dirAbsolute, shouldSearch: false }
}

/**
 * Transforms a relative filepath into an absolute one, using the project root as the base.
 * Handles '..' and '.' in paths correctly. Also handles Windows paths.
 *
 * @param filepath The relative filepath to transform
 * @param projectRoot The absolute path to the project root
 * @returns The absolute filepath
 */
export function toAbsolutePath(filepath: string, projectRoot: string): string {
  // If already absolute, normalize and return
  if (path.isAbsolute(filepath)) {
    return path.normalize(filepath)
  }

  // Handle '..' at the start by resolving against project root
  return path.normalize(path.resolve(projectRoot, filepath))
}

export function isSubdir(fromPath: string, toPath: string) {
  const resolvedFrom = path.resolve(fromPath)
  const resolvedTo = path.resolve(toPath)

  if (process.platform === 'win32') {
    const fromDrive = path.parse(resolvedFrom).root.toLowerCase()
    const toDrive = path.parse(resolvedTo).root.toLowerCase()
    if (fromDrive !== toDrive) {
      return false
    }
  }

  return !path.relative(resolvedFrom, resolvedTo).startsWith('..')
}

let cachedProjectFileContext: ProjectFileContext | undefined

export function initProjectFileContextWithWorker(
  dir: string,
  resetCache: boolean = false
) {
  if (resetCache) {
    cachedProjectFileContext = undefined
  }
  // NOTE: Uses the built worker-script-project-context.js within dist.
  // So you need to run `bun run build` before running locally.
  const workerPath = __filename.endsWith('.ts')
    ? path.join(__dirname, '..', 'dist', 'workers/project-context.js')
    : path.join(__dirname, 'workers/project-context.js')
  const worker = new Worker(workerPath as any)

  worker.postMessage({ dir })

  return new Promise<ProjectFileContext>((resolve, reject) => {
    worker.on('message', (initFileContext) => {
      worker.terminate()
      cachedProjectFileContext = initFileContext
      resolve(initFileContext)
    })
  })
}

/**
 * Retrieves or updates the project file context for a given project.
 *
 * This function gathers comprehensive information about the project's files, structure,
 * and state. It either creates a new context if one doesn't exist for the specified
 * project root, or updates an existing cached context with new information.
 *
 * The context includes:
 * - File tree structure
 * - Token scores for code analysis
 * - Knowledge files (project-specific documentation)
 * - User knowledge files (from home directory)
 * - Git changes and status
 * - Changes since the last file version
 * - Shell configuration files
 * - System information
 *
 * @param {string} projectRoot - The root directory path of the project
 * @param {Record<string, string>} lastFileVersion - Record of the last known file versions
 * @param {FileVersion[][]} newFileVersions - Array of file version arrays, representing the history of file changes
 * @returns {Promise<ProjectFileContext>} A promise that resolves to the project file context object
 */
export const getProjectFileContext = async (
  projectRoot: string,
  lastFileVersion: Record<string, string>
) => {
  const gitChanges = await getGitChanges()
  const changesSinceLastChat = getChangesSinceLastFileVersion(lastFileVersion)

  if (
    !cachedProjectFileContext ||
    cachedProjectFileContext.currentWorkingDirectory !== projectRoot
  ) {
    const fileTree = getProjectFileTree(projectRoot)
    const flattenedNodes = flattenTree(fileTree)
    const allFilePaths = flattenedNodes
      .filter((node) => node.type === 'file')
      .map((node) => node.filePath)
    const knowledgeFilePaths = allFilePaths.filter((filePath) => {
      const lowercaseFilePath = filePath.toLowerCase()
      return (
        lowercaseFilePath.endsWith('knowledge.md') ||
        lowercaseFilePath.endsWith('claude.md') ||
        lowercaseFilePath === codebuffConfigFile ||
        lowercaseFilePath === codebuffConfigFileBackup
      )
    })
    const knowledgeFiles = getExistingFiles(knowledgeFilePaths)
    const knowledgeFilesWithScrapedContent =
      await addScrapedContentToFiles(knowledgeFiles)

    // Get knowledge files from user's home directory
    const homeDir = os.homedir()
    const userKnowledgeFiles = findKnowledgeFilesInDir(homeDir)
    const userKnowledgeFilesWithScrapedContent =
      await addScrapedContentToFiles(userKnowledgeFiles)

    const shellConfigFiles = loadShellConfigFiles()
    const { tokenScores, tokenCallers } = await getFileTokenScores(
      projectRoot,
      allFilePaths
    )

    cachedProjectFileContext = {
      currentWorkingDirectory: projectRoot,
      fileTree,
      fileTokenScores: tokenScores,
      tokenCallers,
      knowledgeFiles: knowledgeFilesWithScrapedContent,
      shellConfigFiles,
      systemInfo: getSystemInfo(),
      userKnowledgeFiles: userKnowledgeFilesWithScrapedContent,
      gitChanges,
      changesSinceLastChat,
      fileVersions: [],
    }
  }

  return cachedProjectFileContext
}

/**
 * Retrieves information about the current state of the Git repository.
 *
 * This asynchronous function executes several Git commands to gather comprehensive
 * information about the repository's current state, including:
 * - Current status (modified files, untracked files, etc.)
 * - Uncommitted changes (diff)
 * - Staged changes (cached diff)
 * - Recent commit messages (from the last 10 commits)
 *
 * The function uses the global projectRoot variable to determine which repository
 * to query. If any Git command fails (e.g., if the directory is not a Git repository),
 * the function gracefully handles the error and returns empty strings for all properties.
 *
 * @returns {Promise<{status: string, diff: string, diffCached: string, lastCommitMessages: string}>}
 *          A promise that resolves to an object containing Git repository information:
 *          - status: Output of 'git status' command
 *          - diff: Output of 'git diff' command showing uncommitted changes
 *          - diffCached: Output of 'git diff --cached' command showing staged changes
 *          - lastCommitMessages: Recent commit messages, formatted as a newline-separated string
 */
async function getGitChanges() {
  try {
    const { stdout: status } = await execAsync('git status', {
      cwd: projectRoot,
    })
    const { stdout: diff } = await execAsync('git diff', { cwd: projectRoot })
    const { stdout: diffCached } = await execAsync('git diff --cached', {
      cwd: projectRoot,
    })
    const { stdout: shortLogOutput } = await execAsync(
      'git shortlog HEAD~10..HEAD',
      {
        cwd: projectRoot,
      }
    )
    const shortLogLines = shortLogOutput.trim().split('\n')
    const lastCommitMessages = shortLogLines
      .slice(1)
      .reverse()
      .map((line) => line.trim())
      .join('\n')

    return { status, diff, diffCached, lastCommitMessages }
  } catch (error) {
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        projectRoot,
      },
      'Failed to get git changes'
    )
    return { status: '', diff: '', diffCached: '', lastCommitMessages: '' }
  }
}

/**
 * Identifies changes between the last known version of files and their current state on disk.
 *
 * This function compares each file in the provided lastFileVersion record with its current
 * content on disk. For files that have changed, it generates a patch using the diff library's
 * createPatch function. Files that haven't changed or can't be read are filtered out from
 * the result.
 *
 * The function is used to track changes made to files since the last interaction or session,
 * which helps maintain context about what has changed in the project over time.
 *
 * @param {Record<string, string>} lastFileVersion - A record mapping file paths to their
 *        content as of the last known version
 * @returns {Record<string, string>} A record mapping file paths to patch strings for files
 *          that have changed since the last version. Files that haven't changed or couldn't
 *          be read are not included in the result.
 */
export function getChangesSinceLastFileVersion(
  lastFileVersion: Record<string, string>
) {
  const changes = Object.entries(lastFileVersion)
    .map(([filePath, file]) => {
      const fullFilePath = path.join(getProjectRoot(), filePath)
      try {
        const currentContent = fs.readFileSync(fullFilePath, 'utf8')
        if (currentContent === file) {
          return [filePath, null] as const
        }
        return [filePath, createPatch(filePath, file, currentContent)] as const
      } catch (error) {
        logger.error(
          {
            errorMessage:
              error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            filePath: fullFilePath,
          },
          'Error reading file for changes comparison'
        )
        return [filePath, null] as const
      }
    })
    .filter(([_, diff]) => diff !== null) as [string, string][]
  return Object.fromEntries(changes)
}

export function getFiles(filePaths: string[]) {
  const result: Record<string, string | null> = {}
  const MAX_FILE_SIZE = 1024 * 1024 // 1MB in bytes
  const ig = parseGitignore(projectRoot, projectRoot)

  for (const filePath of filePaths) {
    if (!filePath) {
      continue
    }

    // Convert absolute paths within project to relative paths
    const relativePath = filePath.startsWith(projectRoot)
      ? path.relative(projectRoot, filePath)
      : filePath
    const fullPath = path.join(projectRoot, relativePath)
    if (isAbsolute(relativePath) || !fullPath.startsWith(projectRoot)) {
      result[relativePath] = FILE_READ_STATUS.OUTSIDE_PROJECT
      continue
    }
    try {
      if (ig.ignores(relativePath)) {
        result[relativePath] = FILE_READ_STATUS.IGNORED
        continue
      }
    } catch (error) {
      logger.error(
        {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          relativePath,
        },
        'Error checking if file is ignored'
      )
      result[relativePath] = FILE_READ_STATUS.ERROR
      continue
    }
    try {
      const stats = fs.statSync(fullPath)
      if (stats.size > MAX_FILE_SIZE) {
        result[relativePath] =
          FILE_READ_STATUS.TOO_LARGE +
          ` [${(stats.size / (1024 * 1024)).toFixed(2)}MB]`
      } else {
        const content = fs.readFileSync(fullPath, 'utf8')
        result[relativePath] = content
      }
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        result[relativePath] = FILE_READ_STATUS.DOES_NOT_EXIST
      } else {
        logger.error(
          {
            errorMessage:
              error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            fullPath,
          },
          'Error reading file'
        )
        result[relativePath] = FILE_READ_STATUS.ERROR
      }
    }
  }
  return result
}
export function getFilesOrNull(filePaths: string[]) {
  const result = getFiles(filePaths)
  return Object.fromEntries(
    Object.entries(result).map(([filePath, content]) => [
      filePath,
      toOptionalFile(content),
    ])
  )
}

export function getExistingFiles(filePaths: string[]) {
  return filterObject(
    getFilesOrNull(filePaths),
    (value) => value !== null
  ) as Record<string, string>
}
export async function addScrapedContentToFiles(files: Record<string, string>) {
  const newFiles = { ...files }
  await Promise.all(
    Object.entries(files).map(async ([filePath, content]) => {
      const urls = parseUrlsFromContent(content)
      const scrapedContent = await getScrapedContentBlocks(urls)

      newFiles[filePath] =
        content +
        (scrapedContent.length > 0 ? '\n' : '') +
        scrapedContent.join('\n')
    })
  )
  return newFiles
}

function findKnowledgeFilesInDir(dir: string): Record<string, string> {
  const result: Record<string, string> = {}
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true })
    for (const file of files) {
      if (!file.isDirectory() && file.name.endsWith('knowledge.md')) {
        const fullPath = path.join(dir, file.name)
        try {
          const content = fs.readFileSync(fullPath, 'utf8')
          result[file.name] = content
        } catch (error) {
          // Skip files we can't read
          logger.error(
            {
              errorMessage:
                error instanceof Error ? error.message : String(error),
              errorStack: error instanceof Error ? error.stack : undefined,
              fullPath,
            },
            'Error reading knowledge file'
          )
        }
      }
    }
  } catch (error) {
    // Skip directories we can't read
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        dir,
      },
      'Error reading directory for knowledge files'
    )
  }
  return result
}

export function getFilesAbsolutePath(filePaths: string[]) {
  const result: Record<string, string | null> = {}
  for (const filePath of filePaths) {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      result[filePath] = content
    } catch (error) {
      logger.error(
        {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          filePath,
        },
        'Error reading file by absolute path'
      )
      result[filePath] = null
    }
  }
  return result
}

export function setFiles(files: Record<string, string>) {
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(projectRoot, filePath)
    fs.writeFileSync(fullPath, content, 'utf8')
  }
}

export function getFileBlocks(filePaths: string[]) {
  const result: Record<string, string> = {}

  for (const filePath of filePaths) {
    const fullPath = path.join(projectRoot, filePath)
    try {
      const content = fs.readFileSync(fullPath, 'utf8')
      result[filePath] = content
    } catch (error) {
      const fileDoesNotExist =
        error instanceof Error &&
        error.message.includes('no such file or directory')

      result[filePath] = fileDoesNotExist
        ? '[FILE_DOES_NOT_EXIST]'
        : '[FILE_READ_ERROR]'

      if (!fileDoesNotExist) {
        console.error(`Error reading file ${fullPath}`)
        logger.error(
          {
            errorMessage:
              error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            fullPath,
          },
          'Error reading file for file blocks'
        )
      }
    }
  }

  const fileBlocks = filePaths.map((filePath) =>
    createWriteFileBlock(filePath, result[filePath])
  )

  return fileBlocks.join('\n')
}

const loadShellConfigFiles = () => {
  const homeDir = os.homedir()
  const configFiles = [
    path.join(homeDir, '.bashrc'),
    path.join(homeDir, '.bash_profile'),
    path.join(homeDir, '.bash_login'),
    path.join(homeDir, '.profile'),
    path.join(homeDir, '.zshrc'),
    path.join(homeDir, '.kshrc'),
  ]
  const files = getFilesAbsolutePath(configFiles)
  return filterObject(files, (value) => value !== null) as Record<
    string,
    string
  >
}

/*
function getExportedTokensForFiles(
  filePaths: string[]
): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  const fullFilePaths = filePaths.map((filePath) =>
    path.join(projectRoot, filePath)
  )
  const program = ts.createProgram(fullFilePaths, {})

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i]
    const fullFilePath = fullFilePaths[i]
    const sourceFile = program.getSourceFile(fullFilePath)
    if (sourceFile) {
      try {
        const exportedTokens = getExportedTokens(sourceFile)
        result[filePath] = exportedTokens
      } catch (error) {
        console.error(`Error processing file ${fullFilePath}:`, error)
        result[filePath] = []
      }
    } else {
      // console.error(`Could not find source file: ${fullFilePath}`)
      result[filePath] = []
    }
  }

  return result
}

function getExportedTokens(sourceFile: ts.SourceFile): string[] {
  const exportedTokens: string[] = []

  function visit(node: ts.Node) {
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        node.exportClause.elements.forEach((element) => {
          exportedTokens.push(element.name.text)
        })
      }
    } else if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isVariableStatement(node)
    ) {
      if (
        node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
        )
      ) {
        if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
          if (node.name) {
            exportedTokens.push(node.name.text)
          }
        } else if (ts.isVariableStatement(node)) {
          node.declarationList.declarations.forEach((declaration) => {
            if (ts.isIdentifier(declaration.name)) {
              exportedTokens.push(declaration.name.text)
            }
          })
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return exportedTokens
}
*/

export const deleteFile = (fullPath: string): boolean => {
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
      return true
    }
    return false
  } catch (error) {
    console.error(`Error deleting file ${fullPath}:`, error)
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        fullPath,
      },
      'Error deleting file'
    )
    return false
  }
}
