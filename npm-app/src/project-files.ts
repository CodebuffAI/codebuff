import fs from 'fs'
import os from 'os'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { createPatch } from 'diff'
import { green } from 'picocolors'

import { createFileBlock, ProjectFileContext } from 'common/util/file'
import { filterObject } from 'common/util/object'
import { parseUrlsFromContent, getScrapedContentBlocks } from './web-scraper'
import { getProjectFileTree, flattenTree } from 'common/project-file-tree'
import { getFileTokenScores } from 'code-map/parse'

const execAsync = promisify(exec)

let projectRoot: string

export function setProjectRoot(dir: string | undefined) {
  const newDir = path.resolve(dir || getCurrentDirectory())
  if (fs.existsSync(newDir)) {
    if (projectRoot) {
      console.log(
        green('\nDirectory change:'),
        `Manicode will read and write files in "${newDir}".\n`
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

export const getProjectFileContext = async (
  fileList: string[],
  lastFileVersion: Record<string, string>
) => {
  const projectRoot = getProjectRoot()

  const files = getFiles(fileList)
  const gitChanges = await getGitChanges()
  const changesSinceLastChat = getChangesSinceLastFileVersion(lastFileVersion)
  const updatedProps = {
    files,
    gitChanges,
    changesSinceLastChat,
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
    const knowledgeFiles =
      await getExistingFilesWithScrapedContent(knowledgeFilePaths)
    const shellConfigFiles = loadShellConfigFiles()

    const fileTokenScores = await getFileTokenScores(projectRoot, allFilePaths)

    cachedProjectFileContext = {
      currentWorkingDirectory: projectRoot,
      fileTree,
      fileTokenScores,
      knowledgeFiles,
      shellConfigFiles,
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
  for (const filePath of filePaths) {
    const fullPath = path.join(projectRoot, filePath)
    try {
      const content = fs.readFileSync(fullPath, 'utf8')
      result[filePath] = content
    } catch (error) {
      result[filePath] = null
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

export async function getExistingFilesWithScrapedContent(
  filePaths: string[]
): Promise<Record<string, string>> {
  const files = getExistingFiles(filePaths)
  const result: Record<string, string> = {}

  for (const [filePath, content] of Object.entries(files)) {
    result[filePath] = content

    if (filePath.endsWith('knowledge.md')) {
      const scrapedBlocks = await getScrapedContentBlocks(
        parseUrlsFromContent(content)
      )
      for (const block of scrapedBlocks) {
        result[filePath] += `\n\n${block}`
      }
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
