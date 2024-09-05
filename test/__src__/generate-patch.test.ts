import { expect, describe, it } from 'bun:test'
import * as fs from 'fs'
import path from 'path'
import { applyPatch } from 'diff'
import { generatePatch } from 'backend/generate-patch'

const mockDataDir = path.join(__dirname, '../__mock-data__')
const CLAUDE_CALL_TIMEOUT = 1000 * 150

const runPatchTest = async (dir: string, mockFilePath: string) => {
  const oldFile = fs.readFileSync(`${dir}/old.ts`, 'utf8')
  const newFile = fs.readFileSync(`${dir}/new.ts`, 'utf8')
  const expectedFile = fs.readFileSync(`${dir}/expected.ts`, 'utf8')

  const patch = await generatePatch(
    'userId',
    oldFile,
    newFile,
    mockFilePath,
    [],
    ''
  )
  const updatedFile = applyPatch(oldFile, patch)

  expect(updatedFile).toEqual(expectedFile)
}

describe('generatePatch', () => {
  it.only(
    'should work for missing-line-actions',
    async () => {
      await runPatchTest(
        `${mockDataDir}/missing-line-actions`,
        'src/actions.ts'
      )
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should work for missing-line-actions',
    async () => {
      await runPatchTest(
        `${mockDataDir}/missing-line-actions`,
        'src/actions.ts'
      )
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should generate diff for simple change',
    async () => {
      await runPatchTest(`${mockDataDir}/simple`, 'button.tsx')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should handle various indentation levels in complex change',
    async () => {
      await runPatchTest(`${mockDataDir}/indentation`, 'src/index.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should handle lots of comments to keep existing code',
    async () => {
      await runPatchTest(`${mockDataDir}/existing-comments`, 'src/index.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should handle long template string in system prompt',
    async () => {
      await runPatchTest(`${mockDataDir}/system-prompt`, 'src/system-prompt.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should not duplicate code from old',
    async () => {
      await runPatchTest(`${mockDataDir}/duplicate-imports`, 'src/tools.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should handle many updates',
    async () => {
      await runPatchTest(`${mockDataDir}/many-updates`, 'src/chat-client.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should work on large javascript file, graph',
    async () => {
      await runPatchTest(`${mockDataDir}/graph`, 'src/graph.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should work on actions with 3 comments to expand',
    async () => {
      await runPatchTest(`${mockDataDir}/actions`, 'src/action.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should add object on long schema',
    async () => {
      await runPatchTest(`${mockDataDir}/schema`, 'src/schema.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should add import and use it later in long file',
    async () => {
      await runPatchTest(`${mockDataDir}/app`, 'src/app.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should remove try catch in delete comment',
    async () => {
      await runPatchTest(
        `${mockDataDir}/delete-comment`,
        'src/delete-comment.ts'
      )
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should work for hallucinated',
    async () => {
      await runPatchTest(`${mockDataDir}/hallucinated`, 'src/main-prompt.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )
})
