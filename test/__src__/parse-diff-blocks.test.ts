import { expect, describe, it } from 'bun:test'
import { parseAndGetDiffBlocksSingleFile } from 'backend/generate-diffs-prompt'

describe('parseAndGetDiffBlocksSingleFile', () => {
  it('should handle whitespace differences in search content', () => {
    const oldContent = `function processData(data) {
    const result = data
        .map(item => {
            return item.value;
        })
        .filter(value => value > 0);
    return result;
}`

    const searchReplaceContent = `<search>
    const result = data
        .map(item => {
            return item.value;
        })
</search>
<replace>
    const result = data.map(item=>{return item.value;})
</replace>`

    const { diffBlocks, diffBlocksThatDidntMatch } =
      parseAndGetDiffBlocksSingleFile(searchReplaceContent, oldContent)

    expect(diffBlocksThatDidntMatch.length).toBe(0)
    expect(diffBlocks.length).toBe(1)
    expect(diffBlocks[0].searchContent).toBe(`    const result = data
        .map(item => {
            return item.value;
        })`)
  })

  it('should preserve original whitespace when matching', () => {
    const oldContent = `function test() {
    doSomething(
        arg1,
        arg2
    );
}`
    
    const searchReplaceContent = `<search>doSomething(arg1,arg2)</search>
<replace>doSomething(arg2,arg1)</replace>`

    const { diffBlocks, diffBlocksThatDidntMatch } =
      parseAndGetDiffBlocksSingleFile(searchReplaceContent, oldContent)

    expect(diffBlocksThatDidntMatch.length).toBe(0)
    expect(diffBlocks.length).toBe(1)
    expect(diffBlocks[0].searchContent).toBe(`
    doSomething(
        arg1,
        arg2
    )`)
  })
})
