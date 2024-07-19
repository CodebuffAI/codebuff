import * as fs from 'fs'
import { generateDiffBlocks } from '../prompts'

const CLAUDE_CALL_TIMEOUT = 1000 * 60

describe('generateDiffBlocks', () => {
  it(
    'should generate <search> and <replace> blocks for small change',
    async () => {
      const oldCode = `import React from 'react'

const Button = () => {
  return <button>Click me</button>
}
`
      const newCode = `import React from 'react'

const FunButton = () => {
  return <button>Fun Button</button>
}
`
      const diffBlocks = await generateDiffBlocks(
        [],
        'src/example.ts',
        oldCode,
        newCode
      )

      let updatedContent = oldCode
      for (const { searchContent, replaceContent } of diffBlocks) {
        updatedContent = updatedContent.replace(searchContent, replaceContent)
      }
      expect(updatedContent).toEqual(newCode)
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should handle various indentation levels in complex change',
    async () => {
      const oldCode = fs.readFileSync(
        'src/__tests__/__mock-data__/index-old.ts',
        'utf8'
      )
      const newCode = fs.readFileSync(
        'src/__tests__/__mock-data__/index-new.ts',
        'utf8'
      )
      const diffBlocks = await generateDiffBlocks(
        [],
        'src/index.ts',
        oldCode,
        newCode
      )

      let updatedContent = oldCode
      for (const { searchContent, replaceContent } of diffBlocks) {
        updatedContent = updatedContent.replace(searchContent, replaceContent)
      }
      const newGoal = fs.readFileSync(
        'src/__tests__/__mock-data__/index-new-goal.ts',
        'utf8'
      )
      expect(updatedContent).toEqual(newGoal)
    },
    CLAUDE_CALL_TIMEOUT
  )
})
