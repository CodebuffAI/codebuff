import * as fs from 'fs'
import { generateDiffs } from '../generate-diffs-haiku'

const CLAUDE_CALL_TIMEOUT = 1000 * 60

const runDiffTest = async (dir: string, mockFilePath: string) => {
  const oldFile = fs.readFileSync(`${dir}/old.ts`, 'utf8')
  const newFile = fs.readFileSync(`${dir}/new.ts`, 'utf8')
  const expectedFile = fs.readFileSync(`${dir}/expected.ts`, 'utf8')
  const diffBlocks = await generateDiffs(oldFile, newFile, mockFilePath, [])
  let updatedContent = oldFile
  for (const { searchContent, replaceContent } of diffBlocks) {
    updatedContent = updatedContent.replace(searchContent, replaceContent)
  }
  expect(updatedContent).toEqual(expectedFile)
}

describe('generateDiffs', () => {
  it(
    'should generate diff for simple change',
    async () => {
      await runDiffTest('src/__tests__/__mock-data__/simple', 'button.tsx')
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should handle various indentation levels in complex change',
    async () => {
      await runDiffTest(
        'src/__tests__/__mock-data__/indentation',
        'src/index.ts'
      )
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should handle lots of comments to keep existing code',
    async () => {
      await runDiffTest(
        'src/__tests__/__mock-data__/existing-comments',
        'src/index.ts'
      )
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should handle long template string in system prompt',
    async () => {
      await runDiffTest(
        'src/__tests__/__mock-data__/system-prompt',
        'src/system-prompt.ts'
      )
    },
    CLAUDE_CALL_TIMEOUT
  )
})
