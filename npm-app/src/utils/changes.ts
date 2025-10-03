import fs from 'fs'
import path from 'path'

import { isFileIgnored } from '@codebuff/common/project-file-tree'
import { getErrorObject } from '@codebuff/common/util/error'
import { applyPatch } from 'diff'

import type { FileChanges } from '@codebuff/common/actions'

export function applyChanges(projectRoot: string, changes: FileChanges) {
  const created: string[] = []
  const modified: string[] = []
  const ignored: string[] = []
  const invalid: string[] = []
  const patchFailed: string[] = []

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
        if (newContent === false) {
          patchFailed.push(filePath)
          continue
        }
        fs.writeFileSync(fullPath, newContent)
      }
      if (fileExists) {
        modified.push(filePath)
      } else {
        created.push(filePath)
      }
    } catch (error) {
      console.error(
        `Failed to apply patch to ${filePath}:`,
        getErrorObject(error),
        content,
      )
      invalid.push(filePath)
    }
  }

  return { created, modified, ignored, patchFailed, invalid }
}
