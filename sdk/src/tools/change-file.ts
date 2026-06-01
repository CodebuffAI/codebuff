import path from 'path'

import {
  CHANGES,
  FileChangeSchema,
  type FileChange,
} from '@codebuff/common/actions'
import { fileExists } from '@codebuff/common/util/file'
import { applyPatch } from 'diff'

import { resolveFilePathWithinProject } from './path-utils'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { ResolvedProjectPath } from './path-utils'

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
  const resolvedPath = resolveFilePathWithinProject(cwd, fileChange.path)
  if (!resolvedPath) {
    throw new Error('file path is outside the project directory')
  }

  const result = await applyChange({ change: fileChange, resolvedPath, fs })

  return [{ type: 'json', value: formatApplyChangeResult(result, fileChange) }]
}

export async function changeFiles(params: {
  parameters: unknown
  cwd: string
  fs: CodebuffFileSystem
}): Promise<CodebuffToolOutput<'edit_transaction'>> {
  const { parameters, cwd, fs } = params
  const changes = CHANGES.parse(parameters)
  const resolvedChanges = changes.map((change) => {
    const resolvedPath = resolveFilePathWithinProject(cwd, change.path)
    if (!resolvedPath) {
      throw new Error('file path is outside the project directory')
    }
    return { change, resolvedPath }
  })

  const prepared = await prepareChanges({ changes: resolvedChanges, fs })
  const failed = prepared.find((result) => result.status !== 'prepared')
  if (failed) {
    return [
      {
        type: 'json',
        value: {
          errorMessage: [
            'Atomic edit_transaction apply failed before writing any files.',
            failed.status === 'patchFailed'
              ? `Failed to apply patch for ${failed.file}.`
              : `Failed to prepare ${failed.file}.`,
          ].join('\n'),
          failures: [
            {
              editIndex: -1,
              path: failed.file,
              errorMessage:
                failed.status === 'patchFailed'
                  ? 'Failed to apply patch.'
                  : 'Failed to write to file: file path caused an error or file could not be written',
            },
          ],
        },
      },
    ]
  }

  const preparedChanges = prepared.filter(
    (preparedChange): preparedChange is Extract<PreparedChangeResult, { status: 'prepared' }> =>
      preparedChange.status === 'prepared',
  )

  const rollbackWrites: typeof preparedChanges = []
  try {
    for (const preparedChange of preparedChanges) {
      const dirPath = path.dirname(preparedChange.resolvedPath.fullPath)
      await fs.mkdir(dirPath, { recursive: true })
      await fs.writeFile(preparedChange.resolvedPath.fullPath, preparedChange.content)
      rollbackWrites.push(preparedChange)
    }
  } catch (error) {
    for (const preparedChange of rollbackWrites.toReversed()) {
      if (preparedChange.previousExists) {
        await fs.writeFile(
          preparedChange.resolvedPath.fullPath,
          preparedChange.previousContent,
        )
      } else {
        await fs.unlink(preparedChange.resolvedPath.fullPath)
      }
    }

    const errorMessage = error instanceof Error ? error.message : String(error)
    return [
      {
        type: 'json',
        value: {
          errorMessage: [
            'Atomic edit_transaction apply failed while writing files.',
            'Rolled back all files written by this transaction.',
            errorMessage,
          ].join('\n'),
          failures: [
            {
              editIndex: -1,
              path: preparedChanges.map((preparedChange) => preparedChange.file).join(', '),
              errorMessage,
            },
          ],
        },
      },
    ]
  }

  return [
    {
      type: 'json',
      value: {
        message: `Atomic edit_transaction applied ${preparedChanges.length} file change(s).`,
        files: preparedChanges.map((preparedChange) => ({
          path: preparedChange.file,
          patch: preparedChange.patch,
          messages: [],
        })),
      },
    },
  ]
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

type PreparedChangeResult =
  | {
      status: 'prepared'
      file: string
      patch: string
      content: string
      previousExists: boolean
      previousContent: string
      resolvedPath: ResolvedProjectPath
    }
  | { status: 'patchFailed'; file: string; patch: string }
  | { status: 'invalid'; file: string }

async function prepareChanges(params: {
  changes: { change: FileChange; resolvedPath: ResolvedProjectPath }[]
  fs: CodebuffFileSystem
}): Promise<PreparedChangeResult[]> {
  const { changes, fs } = params
  const results: PreparedChangeResult[] = []

  for (const { change, resolvedPath } of changes) {
    const result = await prepareChange({ change, resolvedPath, fs })
    results.push(result)
  }

  return results
}

async function prepareChange(params: {
  change: FileChange
  resolvedPath: ResolvedProjectPath
  fs: CodebuffFileSystem
}): Promise<PreparedChangeResult> {
  const { change, resolvedPath, fs } = params
  const { content, type } = change
  const { fullPath, relativePath } = resolvedPath

  try {
    const exists = await fileExists({ filePath: fullPath, fs })
    const previousContent = exists ? await fs.readFile(fullPath, 'utf-8') : ''

    if (type === 'file') {
      return {
        status: 'prepared',
        file: relativePath,
        patch: '',
        content,
        previousExists: exists,
        previousContent,
        resolvedPath,
      }
    }

    const oldContent = previousContent
    const newContent = applyPatch(oldContent, content)
    if (newContent === false) {
      return { status: 'patchFailed', file: relativePath, patch: content }
    }
    return {
      status: 'prepared',
      file: relativePath,
      patch: content,
      content: newContent,
      previousExists: exists,
      previousContent,
      resolvedPath,
    }
  } catch (error) {
    console.error(`Failed to prepare patch for ${relativePath}:`, error, content)
    return { status: 'invalid', file: relativePath }
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
