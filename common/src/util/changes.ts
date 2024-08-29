import fs from 'fs'
import path from 'path'
import { applyPatch } from 'diff'

import { FileChanges } from '../actions'
import { getFilePathFromPatch } from './file'

export function applyChanges(projectRoot: string, changes: FileChanges) {
  const created: string[] = []
  const modified: string[] = []

  for (const patch of changes) {
    const filePath = getFilePathFromPatch(patch)
    const fullPath = path.join(projectRoot, filePath)

    let oldContent = ''
    if (fs.existsSync(fullPath)) {
      oldContent = fs.readFileSync(fullPath, 'utf-8')
    }

    const newContent = applyPatch(oldContent, patch)

    if (typeof newContent === 'boolean') {
      console.error(`Failed to apply patch to ${filePath}`)
    } else {
      try {
        // Ensure the directory exists
        const dirPath = path.dirname(fullPath)
        fs.mkdirSync(dirPath, { recursive: true })

        // Write the file
        fs.writeFileSync(fullPath, newContent)
        if (oldContent === '') {
          created.push(filePath)
        } else {
          modified.push(filePath)
        }
      } catch (error) {
        console.error(`Failed to write file ${fullPath}:`, error)
      }
    }
  }

  return { created, modified }
}

export async function applyAndRevertChanges(
  projectRoot: string,
  changes: FileChanges,
  onApply: () => Promise<void>
) {
  const filesChanged = changes.map(getFilePathFromPatch)
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
      fs.unlinkSync(path.join(projectRoot, filePath))
    } else {
      fs.writeFileSync(path.join(projectRoot, filePath), oldContent)
    }
  }
}
