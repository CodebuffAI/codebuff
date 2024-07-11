import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'
import { createFileBlock } from './file'

export function getSystemPrompt() {
  const codeFiles = getOnlyCodeFiles()
  const fileBlocks = getFileBlocks(codeFiles)

  return `
<project_files>
Here are all the code files in our project.
${fileBlocks}
</project_files>

<editing_instructions>
To edit any files, please use the following schema.
For each file, provide one file block with the file path as an xml attribute and the updated file contents:
<file path="path/to/new/file.tsx">
// Entire file contents here
</file>

To modify an existing file, use comments to indicate where existing code should be preserved:
<file path="path/to/existing/file.tsx">
// ... existing imports...

// ... existing code ...

function getDesktopNav() {
  console.log('Hello from the desktop nav')

  // ... rest of the function
}

// ... rest of the file
</file>
</editing_instructions>

<important_instruction>
Always end your response with the following marker:
[END_OF_RESPONSE]
If your response is cut off due to length limitations, do not include the marker and wait for a follow-up prompt to continue.
</important_instruction>`
}

const projectRoot = path.normalize(path.resolve(__dirname, '..'))

// Function to load file names of every file in the project
function loadAllProjectFiles(projectRoot: string): string[] {
  const allFiles: string[] = []

  function getAllFiles(dir: string) {
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

function getOnlyCodeFiles() {
  const excludedDirs = [
    'node_modules',
    'dist',
  ]
  const allProjectFiles = loadAllProjectFiles(projectRoot)
    .filter(
      (file) =>
        !excludedDirs.some((dir) => file.includes('/' + dir + '/'))
    )
    .filter(
      (file) =>
        file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.sql')
    )
    .filter((file) => !file.endsWith('.d.ts'))
    .map((file) => file.replace(projectRoot + '/', ''))
  return allProjectFiles
}

function getFileBlocks(
  filePaths: string[]
) {
  const result: Record<string, string> = {}

  for (const filePath of filePaths) {
    const fullPath = path.join(projectRoot, filePath)
    try {
      const content = fs.readFileSync(fullPath, 'utf8')
      result[filePath] = content
    } catch (error) {
      console.error(`Error reading file ${fullPath}:`, error)
      result[filePath] = ''
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