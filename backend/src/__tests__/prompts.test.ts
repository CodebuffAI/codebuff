import { generateDiffBlocks } from '../prompts'

const CLAUDE_CALL_TIMEOUT = 1000 * 60

describe('generateDiffBlocks', () => {
  it(
    'should generate <old> and <new> blocks for small change',
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
      for (const { oldContent, newContent } of diffBlocks) {
        updatedContent = updatedContent.replace(oldContent, newContent)
      }
      expect(updatedContent).toEqual(newCode)
    },
    CLAUDE_CALL_TIMEOUT
  )
})
