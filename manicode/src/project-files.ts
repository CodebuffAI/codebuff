import fs from 'fs'
import path from 'path'
import ts from 'typescript'

import { createFileBlock, ProjectFileContext } from 'common/util/file'
import { FileChanges } from 'common/actions'
import { filterObject } from 'common/util/object'
import { scrapeWebPage, parseUrlsFromContent } from './web-scraper'

const projectRoot = path.normalize(path.resolve(__dirname, '../..'))

export const applyChanges = (changes: FileChanges) => {
  const changesSuceeded = []
  for (const change of changes) {
    const { filePath, old, new: newContent } = change
    const fullPath = path.join(projectRoot, filePath)

    if (newContent === '[DELETE]') {
      if (deleteFile(fullPath)) {
        changesSuceeded.push(change)
        console.log('Deleted file:', filePath)
      }
    } else {
      let content = ''
      let updatedContent = newContent

      const fileAlreadyExists = fs.existsSync(fullPath)
      if (fileAlreadyExists) {
        content = fs.readFileSync(fullPath, 'utf8')
        updatedContent = content.replace(old, newContent)
      }

      if (updatedContent !== content) {
        fs.mkdirSync(path.dirname(fullPath), { recursive: true })
        fs.writeFileSync(fullPath, updatedContent, 'utf8')
        changesSuceeded.push(change)
      } else {
        console.log('Change did not go through for', filePath)
      }
    }
  }
  return changesSuceeded
}

export const getProjectFileContext = async () => {
  const filePaths = getProjectFilePaths()
  const knowledgeFilePaths = filePaths.filter((filePath) =>
    filePath.endsWith('knowledge.md')
  )
  const knowledgeFiles =
    await getExistingFilesWithScrapedContent(knowledgeFilePaths)
  const exportedTokens = getExportedTokensForFiles(filePaths)

  return {
    filePaths,
    exportedTokens,
    knowledgeFiles,
  }
}

function loadAllProjectFiles(
  projectRoot: string,
  excludedDirs: string[]
): string[] {
  const allFiles: string[] = []

  function getAllFiles(dir: string) {
    if (excludedDirs.some((dirName) => dir.includes(dirName))) {
      return
    }

    try {
      const files = fs.readdirSync(dir)
      files.forEach((file) => {
        const filePath = path.join(dir, file)
        try {
          const stats = fs.statSync(filePath)
          if (stats.isDirectory()) {
            getAllFiles(filePath)
          } else {
            allFiles.push(filePath)
          }
        } catch (error: any) {
          // do nothing
        }
      })
    } catch (error: any) {
      // do nothing
    }
  }

  getAllFiles(projectRoot)
  return allFiles
}

function getProjectFilePaths() {
  const excludedDirs = ['node_modules', 'dist', '.git']
  const allProjectFiles = loadAllProjectFiles(projectRoot, excludedDirs).map(
    (file) => file.replace(projectRoot + '/', '')
  )
  return allProjectFiles
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
      const urls = parseUrlsFromContent(content)
      for (const url of urls) {
        const scrapedContent = await scrapeWebPage(url)
        if (scrapedContent) {
          result[filePath] +=
            `\n\n<web_scraped_content url="${url}">\n${scrapedContent}\n</web_scraped_content>`
        }
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
