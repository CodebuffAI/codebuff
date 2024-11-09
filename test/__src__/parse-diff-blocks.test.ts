import { expect, describe, it } from 'bun:test'
import { parseAndGetDiffBlocksSingleFile } from 'backend/generate-diffs-prompt'
import { createSearchReplaceBlock } from 'common/util/file'

describe('parseAndGetDiffBlocksSingleFile', () => {
  it('should handle multiline imports', () => {
    const oldContent = `import {
  Button,
  Card,
  Input,
  Label
} from './components'

function App() {
  return <div>Hello</div>
}`

    const searchReplaceContent = createSearchReplaceBlock(
      'import { Button, Card, Input, Label } from \'./components\'',
      'import { Button, Card, Input, Label, Select } from \'./components\''
    )

    const { diffBlocks, diffBlocksThatDidntMatch } =
      parseAndGetDiffBlocksSingleFile(searchReplaceContent, oldContent)

    expect(diffBlocksThatDidntMatch.length).toBe(0)
    expect(diffBlocks.length).toBe(1)
    expect(diffBlocks[0].searchContent).toBe(
      `import {
  Button,
  Card,
  Input,
  Label
} from './components'`
    )
    expect(diffBlocks[0].replaceContent).toBe(
      `import { Button, Card, Input, Label, Select } from './components'`
    )
  })

  it('should handle python-style indentation mismatch', () => {
    const oldContent = `def process_data():
    items = get_items()
    for item in items:
        if item.valid:
            process_item(item)
            log_item(item)
    return True`

    const searchReplaceContent = createSearchReplaceBlock(
      `for item in items:
    if item.valid:
        process_item(item)
        log_item(item)`,
      `for item in items:
    if item.valid:
        process_item(item)
        log_item(item)
        mark_processed(item)`
    )

    const { diffBlocks, diffBlocksThatDidntMatch } =
      parseAndGetDiffBlocksSingleFile(searchReplaceContent, oldContent)

    expect(diffBlocksThatDidntMatch.length).toBe(0)
    expect(diffBlocks.length).toBe(1)

    expect(diffBlocks[0].searchContent).toBe(`    for item in items:
        if item.valid:
            process_item(item)
            log_item(item)`)
    expect(diffBlocks[0].replaceContent).toBe(`    for item in items:
        if item.valid:
            process_item(item)
            log_item(item)
            mark_processed(item)`)
  })

  it('should handle whitespace differences in search content', () => {
    const oldContent = `function processData(data) {
    const result = data
        .map(item => {
            return item.value;
        })
        .filter(value => value > 0);
    return result;
}`

    const searchReplaceContent = createSearchReplaceBlock(
      `    const result = data
        .map(item => {
            return item.value;
        })`,
      `    const result = data.map(item=>{return item.value;})`
    )
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

    const searchReplaceContent = createSearchReplaceBlock(
      'doSomething(arg1,arg2)',
      'doSomething(arg2,arg1)'
    )

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
