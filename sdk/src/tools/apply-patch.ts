import path from 'path'

import { applyPatch as applyUnifiedPatch } from 'diff'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

type PatchOp =
  | { type: 'add'; path: string; content: string }
  | { type: 'delete'; path: string }
  | { type: 'update'; path: string; moveTo?: string; hunks: string }

function hasTraversal(targetPath: string): boolean {
  const normalized = path.normalize(targetPath)
  return path.isAbsolute(normalized) || normalized.startsWith('..')
}

function parseApplyPatchEnvelope(rawPatch: string): PatchOp[] {
  const normalized = rawPatch.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  if (lines[0] !== '*** Begin Patch') {
    throw new Error('Patch must start with *** Begin Patch')
  }
  if (lines[lines.length - 1] !== '*** End Patch') {
    throw new Error('Patch must end with *** End Patch')
  }

  const ops: PatchOp[] = []
  let i = 1
  const endIndex = lines.length - 1

  while (i < endIndex) {
    const line = lines[i]
    if (!line) {
      i++
      continue
    }

    if (line.startsWith('*** Add File: ')) {
      const filePath = line.slice('*** Add File: '.length)
      i++
      const contentLines: string[] = []
      while (i < endIndex && !lines[i].startsWith('*** ')) {
        if (!lines[i].startsWith('+')) {
          throw new Error(`Add file lines must start with + (${filePath})`)
        }
        contentLines.push(lines[i].slice(1))
        i++
      }
      ops.push({
        type: 'add',
        path: filePath,
        content: contentLines.join('\n'),
      })
      continue
    }

    if (line.startsWith('*** Delete File: ')) {
      const filePath = line.slice('*** Delete File: '.length)
      ops.push({ type: 'delete', path: filePath })
      i++
      continue
    }

    if (line.startsWith('*** Update File: ')) {
      const filePath = line.slice('*** Update File: '.length)
      i++
      let moveTo: string | undefined
      if (i < endIndex && lines[i].startsWith('*** Move to: ')) {
        moveTo = lines[i].slice('*** Move to: '.length)
        i++
      }
      const hunkLines: string[] = []
      while (i < endIndex && !lines[i].startsWith('*** ')) {
        if (lines[i] !== '*** End of File') {
          hunkLines.push(lines[i])
        }
        i++
      }
      const hunks = hunkLines.join('\n').trim()
      if (!hunks.includes('@@')) {
        throw new Error(
          `Update file operation requires at least one @@ hunk (${filePath})`,
        )
      }
      ops.push({ type: 'update', path: filePath, moveTo, hunks })
      continue
    }

    throw new Error(`Unsupported patch operation: ${line}`)
  }

  return ops
}

export async function applyPatchTool(params: {
  parameters: unknown
  cwd: string
  fs: CodebuffFileSystem
}): Promise<CodebuffToolOutput<'apply_patch'>> {
  const { parameters, cwd, fs } = params
  const patch =
    typeof parameters === 'object' &&
    parameters !== null &&
    'patch' in parameters &&
    typeof (parameters as { patch: unknown }).patch === 'string'
      ? (parameters as { patch: string }).patch
      : null

  if (!patch) {
    return [{ type: 'json', value: { errorMessage: 'Missing patch string.' } }]
  }

  try {
    const ops = parseApplyPatchEnvelope(patch)
    const applied: {
      file: string
      action: 'add' | 'update' | 'delete' | 'move'
    }[] = []

    for (const op of ops) {
      if (hasTraversal(op.path)) {
        throw new Error(`Invalid path: ${op.path}`)
      }

      if (op.type === 'add') {
        const fullPath = path.join(cwd, op.path)
        await fs.mkdir(path.dirname(fullPath), { recursive: true })
        await fs.writeFile(fullPath, op.content)
        applied.push({ file: op.path, action: 'add' })
        continue
      }

      if (op.type === 'delete') {
        const fullPath = path.join(cwd, op.path)
        await fs.unlink(fullPath)
        applied.push({ file: op.path, action: 'delete' })
        continue
      }

      const originalPath = path.join(cwd, op.path)
      const oldContent = await fs.readFile(originalPath, 'utf-8')
      const patched = applyUnifiedPatch(oldContent, op.hunks)
      if (patched === false) {
        throw new Error(`Failed to apply hunks for ${op.path}`)
      }

      const outputPath = op.moveTo ?? op.path
      if (hasTraversal(outputPath)) {
        throw new Error(`Invalid path: ${outputPath}`)
      }
      const targetPath = path.join(cwd, outputPath)
      await fs.mkdir(path.dirname(targetPath), { recursive: true })
      await fs.writeFile(targetPath, patched)

      if (op.moveTo && op.moveTo !== op.path) {
        await fs.unlink(originalPath)
        applied.push({ file: outputPath, action: 'move' })
      } else {
        applied.push({ file: outputPath, action: 'update' })
      }
    }

    return [
      {
        type: 'json',
        value: {
          message: `Applied ${applied.length} patch operation${applied.length === 1 ? '' : 's'}.`,
          applied,
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
