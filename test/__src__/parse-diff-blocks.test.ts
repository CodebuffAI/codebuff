import { expect, describe, it } from 'bun:test'
import { parseAndGetDiffBlocksSingleFile } from 'backend/generate-diffs-prompt'

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

    const searchReplaceContent = `<search>import { Button, Card, Input, Label } from './components'</search>
<replace>import { Button, Card, Input, Label, Select } from './components'</replace>`

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

    const searchReplaceContent = `<search>
for item in items:
    if item.valid:
        process_item(item)
        log_item(item)</search>
<replace>
for item in items:
    if item.valid:
        process_item(item)
        log_item(item)
        mark_processed(item)
</replace>`

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
