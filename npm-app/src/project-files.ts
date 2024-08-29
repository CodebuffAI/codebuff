import fs from 'fs'
import path from 'path'

import { createFileBlock, ProjectFileContext } from 'common/util/file'
import { filterObject } from 'common/util/object'
import { parseUrlsFromContent, getScrapedContentBlocks } from './web-scraper'
import {
  getProjectFileTree,
  getAllFilePaths,
} from 'common/src/project-file-tree'

let projectRoot: string

export function initProjectRoot(dir: string | undefined) {
  projectRoot = path.resolve(dir || getCurrentDirectory())
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

export function getProjectRoot() {
  return projectRoot
}

let cachedProjectFileContext: ProjectFileContext | undefined

export const getProjectFileContext = async (fileList: string[]) => {
  if (!cachedProjectFileContext) {
    const fileTree = getProjectFileTree(projectRoot)
    const knowledgeFilePaths = getAllFilePaths(fileTree).filter((filePath) =>
      filePath.endsWith('knowledge.md')
    )
    const knowledgeFiles =
      await getExistingFilesWithScrapedContent(knowledgeFilePaths)
    const exportedTokens = {} // getExportedTokensForFiles(filePaths)

    const files = getFiles(fileList)

    cachedProjectFileContext = {
      currentWorkingDirectory: projectRoot,
      fileTree,
      exportedTokens,
      knowledgeFiles,
      files,
    }
  } else {
    const files = getFiles(fileList)
    cachedProjectFileContext = { ...cachedProjectFileContext, files }
  }

  return cachedProjectFileContext
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
