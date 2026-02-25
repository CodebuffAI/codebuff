import path from 'path'

import { applyPatch as applyUnifiedPatch } from 'diff'

import type { ApplyPatchOperation } from '@codebuff/common/tools/params/tool/apply-patch'
import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

function hasTraversal(targetPath: string): boolean {
  const normalized = path.normalize(targetPath)
  return path.isAbsolute(normalized) || normalized.startsWith('..')
}

function extractCreateFileContent(diff: string): string {
  const lines = diff.replace(/\r\n/g, '\n').split('\n')
  const contentLines: string[] = []
  for (const line of lines) {
    if (line.startsWith('@@')) continue
    if (line.startsWith('+')) {
      contentLines.push(line.slice(1))
    }
  }
  return contentLines.join('\n')
}

export async function applyPatchTool(params: {
  parameters: unknown
  cwd: string
  fs: CodebuffFileSystem
}): Promise<CodebuffToolOutput<'apply_patch'>> {
  const { parameters, cwd, fs } = params

  const operation =
    typeof parameters === 'object' &&
    parameters !== null &&
    'operation' in parameters &&
    typeof (parameters as { operation: unknown }).operation === 'object'
      ? (parameters as { operation: ApplyPatchOperation }).operation
      : null

  if (!operation) {
    return [{ type: 'json', value: { errorMessage: 'Missing or invalid operation object.' } }]
  }

  try {
    if (hasTraversal(operation.path)) {
      throw new Error(`Invalid path: ${operation.path}`)
    }

    const fullPath = path.join(cwd, operation.path)

    if (operation.type === 'create_file') {
      const content = extractCreateFileContent(operation.diff)
      await fs.mkdir(path.dirname(fullPath), { recursive: true })
      await fs.writeFile(fullPath, content)
      return [
        {
          type: 'json',
          value: {
            message: 'Applied 1 patch operation.',
            applied: [{ file: operation.path, action: 'add' as const }],
          },
        },
      ]
    }

    if (operation.type === 'delete_file') {
      await fs.unlink(fullPath)
      return [
        {
          type: 'json',
          value: {
            message: 'Applied 1 patch operation.',
            applied: [{ file: operation.path, action: 'delete' as const }],
          },
        },
      ]
    }

    // update_file
    const oldContent = await fs.readFile(fullPath, 'utf-8')
    const patched = applyUnifiedPatch(oldContent, operation.diff)
    if (patched === false) {
      throw new Error(`Failed to apply diff for ${operation.path}`)
    }
    await fs.writeFile(fullPath, patched)
    return [
      {
        type: 'json',
        value: {
          message: 'Applied 1 patch operation.',
          applied: [{ file: operation.path, action: 'update' as const }],
        },
      },
    ]
  } catch (error) {
    return [
      {
        type: 'json',
        value: {
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      },
    ]
  }
}
