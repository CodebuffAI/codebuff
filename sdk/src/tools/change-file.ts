import fs from 'fs'
import path from 'path'

import { applyPatch } from 'diff'
import z from 'zod/v4'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'

const FileChangeSchema = z.object({
  type: z.enum(['patch', 'file']),
  path: z.string(),
  content: z.string(),
})

export function changeFile(
  parameters: unknown,
  cwd: string,
): CodebuffToolOutput<'str_replace'> {
  if (cwd.includes('../')) {
    throw new Error('cwd cannot include ../')
  }
  const fileChange = FileChangeSchema.parse(parameters)
  const lines = fileChange.content.split('\n')

  const { created, modified, invalid, patchFailed } = applyChanges(cwd, [
    fileChange,
  ])

  const results: CodebuffToolOutput<'str_replace'>[0]['value'][] = []

  for (const file of created) {
    results.push({
      file,
      message: 'Created new file',
      unifiedDiff: lines.join('\n'),
    })
  }

  for (const file of modified) {
    results.push({
      file,
      message: 'Updated file',
      unifiedDiff: lines.join('\n'),
    })
  }

  for (const file of patchFailed) {
    results.push({
      file,
      errorMessage: `Failed to apply patch.`,
      patch: lines.join('\n'),
    })
  }

  for (const file of invalid) {
    results.push({
      file,
      errorMessage:
        'Failed to write to file: file path caused an error or file could not be written',
    })
  }

  if (results.length !== 1) {
    throw new Error(
      `Internal error: Unexpected result length while modifying files: ${
        results.length
      }`,
    )
  }

  return [{ type: 'json', value: results[0] }]
}

function applyChanges(
  projectRoot: string,
  changes: {
    type: 'patch' | 'file'
    path: string
    content: string
  }[],
) {
  const created: string[] = []
  const modified: string[] = []
  const patchFailed: string[] = []
  const invalid: string[] = []

  for (const change of changes) {
    const { path: filePath, content, type } = change
    try {
      const fullPath = path.join(projectRoot, filePath)
      const fileExists = fs.existsSync(fullPath)
      if (!fileExists) {
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
      console.error(`Failed to apply patch to ${filePath}:`, error, content)
      invalid.push(filePath)
    }
  }

  return { created, modified, invalid, patchFailed }
}
