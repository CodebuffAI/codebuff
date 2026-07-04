import path from 'path'

import { fileExists } from '@codebuff/common/util/file'
import { applyPatch } from 'diff'
import z from 'zod/v4'

import { resolveFilePath } from './path-utils'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { ResolvedProjectPath } from './path-utils'

const FileChangeSchema = z.object({
  type: z.enum(['patch', 'file']),
  path: z.string(),
  content: z.string(),
})

type FileChange = z.infer<typeof FileChangeSchema>

type ApplyChangeResult =
  | { status: 'created' | 'modified'; file: string }
  | { status: 'patchFailed'; file: string; patch: string }
  | { status: 'invalid'; file: string }

export async function changeFile(params: {
  parameters: unknown
  cwd: string
  fs: CodebuffFileSystem
}): Promise<CodebuffToolOutput<'str_replace'>> {
  const { parameters, cwd, fs } = params

  const fileChange = FileChangeSchema.parse(parameters)
  const resolvedPath = resolveFilePath(cwd, fileChange.path)

  const result = await applyChange({ change: fileChange, resolvedPath, fs })

  return [{ type: 'json', value: formatApplyChangeResult(result, fileChange) }]
}

function formatApplyChangeResult(
  result: ApplyChangeResult,
  fileChange: FileChange,
): CodebuffToolOutput<'str_replace'>[0]['value'] {
  if (result.status === 'created' || result.status === 'modified') {
    return {
      file: result.file,
      message:
        fileChange.type === 'patch'
          ? 'String replace applied successfully.'
          : result.status === 'created'
            ? 'Created file successfully.'
            : 'Overwrote file successfully.',
    }
  }

  if (result.status === 'patchFailed') {
    return {
      file: result.file,
      errorMessage: `Failed to apply patch.`,
      patch: result.patch,
    }
  }

  return {
    file: result.file,
    errorMessage:
      'Failed to write to file: file path caused an error or file could not be written',
  }
}

async function applyChange(params: {
  change: FileChange
  resolvedPath: ResolvedProjectPath
  fs: CodebuffFileSystem
}): Promise<ApplyChangeResult> {
  const { change, resolvedPath, fs } = params
  const { content, type } = change
  const { fullPath, relativePath } = resolvedPath

  try {
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
        return { status: 'patchFailed', file: relativePath, patch: content }
      }
      await fs.writeFile(fullPath, newContent)
    }

    return { status: exists ? 'modified' : 'created', file: relativePath }
  } catch (error) {
    console.error(`Failed to apply patch to ${relativePath}:`, error, content)
    return { status: 'invalid', file: relativePath }
  }
}
