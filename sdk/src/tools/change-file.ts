import path from 'path'

import { fileExists } from '@codebuff/common/util/file'
import { applyPatch } from 'diff'
import z from 'zod/v4'


import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

const FileChangeSchema = z.object({
  type: z.enum(['patch', 'file']),
  path: z.string(),
  content: z.string(),
})

function containsUpwardTraversal(dirPath: string): boolean {
  const normalized = path.normalize(dirPath)
  return normalized.includes('..')
}

/**
 * Checks if a path contains path traversal sequences that would escape the root.
 * Uses proper path normalization to prevent traversal attacks.
 */
function containsPathTraversal(filePath: string): boolean {
  const normalized = path.normalize(filePath)
  // Check for absolute paths or paths starting with .. that escape root
  return path.isAbsolute(normalized) || normalized.startsWith('..')
}

export async function changeFile(params: {
  parameters: unknown
  cwd: string
  fs: CodebuffFileSystem
}): Promise<CodebuffToolOutput<'str_replace'>> {
  const { parameters, cwd, fs } = params

  if (containsUpwardTraversal(cwd)) {
    throw new Error('cwd contains invalid path traversal')
  }
  const fileChange = FileChangeSchema.parse(parameters)
  if (containsPathTraversal(fileChange.path)) {
    throw new Error('file path contains invalid path traversal')
  }
  const lines = fileChange.content.split('\n')

  const { created, modified, invalid, patchFailed } = await applyChanges({
    projectRoot: cwd,
    changes: [fileChange],
    fs,
  })

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

async function applyChanges(params: {
  projectRoot: string
  changes: {
    type: 'patch' | 'file'
    path: string
    content: string
  }[]
  fs: CodebuffFileSystem
}) {
  const { projectRoot, changes, fs } = params

  const created: string[] = []
  const modified: string[] = []
  const patchFailed: string[] = []
  const invalid: string[] = []

  for (const change of changes) {
    const { path: filePath, content, type } = change
    try {
      const fullPath = path.join(projectRoot, filePath)
      const exists = await fileExists({ filePath: fullPath, fs })
      if (!exists) {
        const dirPath = path.dirname(fullPath)
        await fs.mkdir(dirPath, { recursive: true })
      }

      if (type === 'file') {
        await fs.writeFile(fullPath, content)
      } else {
        const oldContent = await fs.readFile(fullPath, 'utf-8')
        const newContent = applyPatch(oldContent, content)
        if (newContent === false) {
          patchFailed.push(filePath)
          continue
        }
        await fs.writeFile(fullPath, newContent)
      }

      if (exists) {
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
