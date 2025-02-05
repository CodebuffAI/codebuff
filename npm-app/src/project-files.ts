import fs from 'fs'
import os from 'os'
import path, { isAbsolute } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { createPatch } from 'diff'
import { green } from 'picocolors'
import { Worker } from 'worker_threads'

import { ensureDirectoryExists } from 'common/util/file'
import { CONFIG_DIR } from './credentials'

// Global variables for chat management
// Initialize chat ID on first import
export const currentChatId = new Date().toISOString().replace(/:/g, '-')

// Get the project-specific data directory
export function getProjectDataDir(): string {
  const root = getProjectRoot()
  if (!root) {
    throw new Error('Project root not set. Call setProjectRoot() first.')
  }

  const baseName = path.basename(root)
  const baseDir = path.join(CONFIG_DIR, 'projects', baseName)

  // If directory doesn't exist or matches our path, use simple name
  if (!fs.existsSync(baseDir) || fs.realpathSync(baseDir) === baseDir) {
    return baseDir
  }

  // Only add hash if we have a collision
  const projectHash = require('crypto')
    .createHash('sha256')
    .update(root)
    .digest('hex')
    .slice(0, 8)
  return path.join(CONFIG_DIR, 'projects', `${baseName}-${projectHash}`)
}

export function getCurrentChatDir(): string {
  const dir = path.join(getProjectDataDir(), 'chats', currentChatId)
  ensureDirectoryExists(dir)
  return dir
}

import {
  createFileBlock,
  FileVersion,
  ProjectFileContext,
} from 'common/util/file'
import { filterObject } from 'common/util/object'
import {
  getProjectFileTree,
  flattenTree,
  parseGitignore,
} from 'common/project-file-tree'
import { getFileTokenScores } from 'code-map/parse'
import { getScrapedContentBlocks, parseUrlsFromContent } from './web-scraper'
import { getSystemInfo } from './utils/system-info'

const execAsync = promisify(exec)

let projectRoot: string

export function setProjectRoot(dir: string | undefined) {
  const newDir = path.resolve(dir || getCurrentDirectory())
  if (fs.existsSync(newDir)) {
    if (projectRoot) {
      console.log(
        green('\nDirectory change:'),
        `Codebuff will read and write files in "${newDir}".\n`
      )
    }
    projectRoot = newDir
    return newDir
  }
  return projectRoot
}

export function getProjectRoot() {
  return projectRoot
}

function getCurrentDirectory() {
  try {
    return process.cwd()
  } catch (error) {
    throw new Error(
      'Failed to get current working directory. Is this directory deleted?',
      { cause: error }
    )
  }
}

let cachedProjectFileContext: ProjectFileContext | undefined

export function initProjectFileContextWithWorker(dir: string) {
  // NOTE: Uses the built worker-script-project-context.js within dist.
  // So you need to run `bun run build` before running locally.
  const workerPath = __filename.endsWith('.ts')
    ? path.join(__dirname, '..', 'dist', 'worker-script-project-context.js')
    : path.join(__dirname, 'worker-script-project-context.js')
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

export const getProjectFileContext = async (
  projectRoot: string,
  lastFileVersion: Record<string, string>,
  fileVersions: FileVersion[][]
) => {
  const gitChanges = await getGitChanges()
  const changesSinceLastChat = getChangesSinceLastFileVersion(lastFileVersion)
  const updatedProps = {
    gitChanges,
    changesSinceLastChat,
    fileVersions,
  }

  if (
    !cachedProjectFileContext ||
    cachedProjectFileContext.currentWorkingDirectory !== projectRoot
  ) {
    const fileTree = getProjectFileTree(projectRoot)
    const flattenedNodes = flattenTree(fileTree)
    const allFilePaths = flattenedNodes
      .filter((node) => node.type === 'file')
      .map((node) => node.filePath)
    const knowledgeFilePaths = allFilePaths.filter((filePath) =>
      filePath.endsWith('knowledge.md')
    )
    const knowledgeFiles = getExistingFiles(knowledgeFilePaths)
    const knowledgeFilesWithScrapedContent =
      await addScrapedContentToFiles(knowledgeFiles)

    // Get knowledge files from user's home directory
    const homeDir = os.homedir()
    const userKnowledgeFiles = findKnowledgeFilesInDir(homeDir)
    const userKnowledgeFilesWithScrapedContent =
      await addScrapedContentToFiles(userKnowledgeFiles)

    const shellConfigFiles = loadShellConfigFiles()
    const fileTokenScores = await getFileTokenScores(projectRoot, allFilePaths)

    cachedProjectFileContext = {
      currentWorkingDirectory: projectRoot,
      fileTree,
      fileTokenScores,
      knowledgeFiles: knowledgeFilesWithScrapedContent,
      userKnowledgeFiles: userKnowledgeFilesWithScrapedContent,
      shellConfigFiles,
      systemInfo: getSystemInfo(),
      ...updatedProps,
    }
  } else {
    cachedProjectFileContext = {
      ...cachedProjectFileContext,
      ...updatedProps,
    }
  }

  return cachedProjectFileContext
}

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
    return { status: '', diff: '', diffCached: '', lastCommitMessages: '' }
  }
}

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
        // console.error(`Error reading file ${fullFilePath}:`, error)
        return [filePath, null] as const
      }
    })
    .filter(([_, diff]) => diff !== null) as [string, string][]
  return Object.fromEntries(changes)
}

export function getFiles(filePaths: string[]) {
  const result: Record<string, string | null> = {}
  const MAX_FILE_SIZE = 1024 * 1024 // 1MB in bytes
  const ig = parseGitignore(projectRoot)

  for (const filePath of filePaths) {
    if (!filePath) {
      result[filePath] = '[INVALID_FILE_PATH]'
      continue
    }

    // Convert absolute paths within project to relative paths
    const relativePath = filePath.startsWith(projectRoot)
      ? path.relative(projectRoot, filePath)
      : filePath
    const fullPath = path.join(projectRoot, relativePath)
    if (isAbsolute(relativePath) || !fullPath.startsWith(projectRoot)) {
      result[relativePath] = '[FILE_OUTSIDE_PROJECT]'
      continue
    }
    try {
      if (ig.ignores(relativePath)) {
        result[relativePath] = '[FILE_IGNORED]'
        continue
      }
    } catch (error) {
      result[relativePath] = '[ERROR_LOADING_FILE]'
      continue
    }
    try {
      const stats = fs.statSync(fullPath)
      if (stats.size > MAX_FILE_SIZE) {
        result[relativePath] =
          `[FILE_TOO_LARGE: ${(stats.size / (1024 * 1024)).toFixed(2)}MB]`
      } else {
        const content = fs.readFileSync(fullPath, 'utf8')
        result[relativePath] = content
      }
    } catch (error) {
      result[relativePath] = null
    }
  }
  return result
}

export function getExistingFiles(filePaths: string[]) {
  return filterObject(getFiles(filePaths), (value) => value !== null) as Record<
    string,
    string
  >
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
          console.error(`Error reading knowledge file ${fullPath}:`, error)
        }
      }
    }
  } catch (error) {
    // Skip directories we can't read
    console.error(`Error reading directory ${dir}:`, error)
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
        console.error(
          `Error reading file ${fullPath}:`,
          error instanceof Error ? error.message : error
        )
      }
    }
  }

  const fileBlocks = filePaths.map((filePath) =>
    createFileBlock(filePath, result[filePath])
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
    return false
  }
}
