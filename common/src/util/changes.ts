import fs from 'fs'
import path from 'path'

import { FileChanges } from '../actions'
import { isFileIgnored } from '../project-file-tree'
import { applyPatch } from './patch'

export function applyChanges(projectRoot: string, changes: FileChanges) {
  const created: string[] = []
  const modified: string[] = []
  const ignored: string[] = []
  const invalid: string[] = []

  for (const change of changes) {
    const { path: filePath, content, type } = change
    try {
      if (isFileIgnored(filePath, projectRoot)) {
        ignored.push(filePath)
        continue
      }
    } catch {
      // File path caused an error.
      invalid.push(filePath)
      continue
    }
    try {
      const fullPath = path.join(projectRoot, filePath)
      const fileExists = fs.existsSync(fullPath)
      if (!fileExists) {
        // Create directories in the path if they don't exist
        const dirPath = path.dirname(fullPath)
        fs.mkdirSync(dirPath, { recursive: true })
      }

      if (type === 'file') {
        fs.writeFileSync(fullPath, content)
      } else {
        const oldContent = fs.readFileSync(fullPath, 'utf-8')
        const newContent = applyPatch(oldContent, content)
        fs.writeFileSync(fullPath, newContent)
      }
      if (fileExists) {
        modified.push(filePath)
      } else {
        created.push(filePath)
      }
    } catch (error) {
      console.error(`Failed to apply patch to ${filePath}:`, error, content)
      invalid.push(filePath)
    }
  }

  return { created, modified, ignored, invalid }
}

export async function applyAndRevertChanges(
  projectRoot: string,
  changes: FileChanges,
  onApply: () => Promise<void>
) {
  const filesChanged = changes.map((change) => change.path)
  const files = Object.fromEntries(
    filesChanged.map((filePath) => {
      const fullPath = path.join(projectRoot, filePath)
      const oldContent = fs.existsSync(fullPath)
        ? fs.readFileSync(fullPath, 'utf-8')
        : '[DOES_NOT_EXIST]'
      return [filePath, oldContent]
    })
  )
  applyChanges(projectRoot, changes)
  try {
    await onApply()
  } catch (error) {
    console.error(`Failed to apply changes:`, error)
  }
  for (const [filePath, oldContent] of Object.entries(files)) {
    if (oldContent === '[DOES_NOT_EXIST]') {
      if (fs.existsSync(path.join(projectRoot, filePath))) {
        fs.unlinkSync(path.join(projectRoot, filePath))
      }
    } else {
      fs.writeFileSync(path.join(projectRoot, filePath), oldContent)
    }
  }
}
