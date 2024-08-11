import * as fs from 'fs'
import { generatePatch } from '../generate-patch'
import { applyPatch } from 'diff'
import { debugLog } from '../util/debug'

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
    []
  )
  const updatedFile = applyPatch(oldFile, patch)

  expect(updatedFile).toEqual(expectedFile)
}

describe('generatePatch', () => {
  it(
    'should generate diff for simple change',
    async () => {
      await runPatchTest('src/__tests__/__mock-data__/simple', 'button.tsx')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should handle various indentation levels in complex change',
    async () => {
      await runPatchTest(
        'src/__tests__/__mock-data__/indentation',
        'src/index.ts'
      )
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should handle lots of comments to keep existing code',
    async () => {
      await runPatchTest(
        'src/__tests__/__mock-data__/existing-comments',
        'src/index.ts'
      )
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should handle long template string in system prompt',
    async () => {
      await runPatchTest(
        'src/__tests__/__mock-data__/system-prompt',
        'src/system-prompt.ts'
      )
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should not duplicate code from old',
    async () => {
      await runPatchTest(
        'src/__tests__/__mock-data__/duplicate-imports',
        'src/tools.ts'
      )
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should handle many updates',
    async () => {
      await runPatchTest(
        'src/__tests__/__mock-data__/many-updates',
        'src/chat-client.ts'
      )
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should work on large javascript file, graph',
    async () => {
      await runPatchTest('src/__tests__/__mock-data__/graph', 'src/graph.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should work on actions with 3 comments to expand',
    async () => {
      await runPatchTest('src/__tests__/__mock-data__/actions', 'src/action.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should add object on long schema',
    async () => {
      await runPatchTest('src/__tests__/__mock-data__/schema', 'src/schema.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should add import and use it later in long file',
    async () => {
      await runPatchTest('src/__tests__/__mock-data__/app', 'src/app.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should remove try catch in delete comment',
    async () => {
      await runPatchTest('src/__tests__/__mock-data__/delete-comment', 'src/delete-comment.ts')
    },
    CLAUDE_CALL_TIMEOUT
  )
})
