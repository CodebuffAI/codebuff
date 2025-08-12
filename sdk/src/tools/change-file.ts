import z from 'zod/v4'
import fs from 'fs'
import path from 'path'
import { applyPatch } from '../../../common/src/util/patch'

const FileChangeSchema = z.object({
  type: z.enum(['patch', 'file']),
  path: z.string(),
  content: z.string(),
})

export function changeFile(
  parameters: unknown,
  cwd: string,
): { toolResultMessage: string } {
  if (cwd.includes('../')) {
    throw new Error('cwd cannot include ../')
  }
  const fileChange = FileChangeSchema.parse(parameters)
  const lines = fileChange.content.split('\n')

  const { created, modified, invalid } = applyChanges(cwd, [fileChange])

  const results: string[] = []

  for (const file of created) {
    results.push(
      `Created ${file} successfully. Changes made:\n${lines.join('\n')}`,
    )
  }

  for (const file of modified) {
    results.push(
      `Wrote to ${file} successfully. Changes made:\n${lines.join('\n')}`,
    )
  }

  for (const file of invalid) {
    results.push(
      `Failed to write to ${file}; file path caused an error or file could not be written`,
    )
  }

  return { toolResultMessage: results.join('\n') }
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

  return { created, modified, invalid }
}
