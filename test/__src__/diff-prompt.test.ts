import { expect, describe, it } from 'bun:test'
import * as fs from 'fs'
import path from 'path'
import { generateExpandedFileWithDiffBlocks } from 'backend/generate-diffs-prompt'

const mockDataDir = path.join(__dirname, '../__mock-data__')
const CLAUDE_CALL_TIMEOUT = 1000 * 200

const runDiffTest = async (dir: string, mockFilePath: string) => {
  const oldFile = fs.readFileSync(`${dir}/old.ts`, 'utf8')
  const newFile = fs.readFileSync(`${dir}/new.ts`, 'utf8')
  const expectedFile = fs.readFileSync(`${dir}/expected.ts`, 'utf8')

  const updatedFile = await generateExpandedFileWithDiffBlocks(
    'userId',
    [],
    '',
    mockFilePath,
    oldFile,
    newFile
  )

  expect(updatedFile).toEqual(expectedFile)
}

describe('generateDiffs', () => {
  it(
    'should generate diff for simple change',
    async () => {
      await runDiffTest(`${mockDataDir}/simple`, 'button.tsx')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should handle various indentation levels in complex change',
    async () => {
      await runDiffTest(`${mockDataDir}/indentation`, 'index.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should handle lots of comments to keep existing code',
    async () => {
      await runDiffTest(`${mockDataDir}/existing-comments`, 'index.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should handle long template string in system prompt',
    async () => {
      await runDiffTest(`${mockDataDir}/system-prompt`, 'system-prompt.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should not duplicate code from old',
    async () => {
      await runDiffTest(`${mockDataDir}/duplicate-imports`, 'tools.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should handle many updates',
    async () => {
      await runDiffTest(`${mockDataDir}/many-updates`, 'chat-client.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should work on large javascript file, graph',
    async () => {
      await runDiffTest(`${mockDataDir}/graph`, 'graph.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should work on actions with 3 comments to expand',
    async () => {
      await runDiffTest(`${mockDataDir}/actions`, 'action.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )
})
