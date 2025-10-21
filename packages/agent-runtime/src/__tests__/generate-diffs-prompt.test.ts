import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { expect, describe, it } from 'bun:test'

import { parseAndGetDiffBlocksSingleFile } from '../generate-diffs-prompt'

describe('parseAndGetDiffBlocksSingleFile', () => {
  it('should parse diff blocks with newline before closing marker', () => {
    const oldContent = 'function test() {\n  return true;\n}\n'
    const newContent = `<<<<<<< SEARCH
function test() {
  return true;
}
=======
function test() {
  if (!condition) return false;
  return true;
}
>>>>>>> REPLACE`

    const result = parseAndGetDiffBlocksSingleFile({
      ...TEST_AGENT_RUNTIME_IMPL,
      newContent,
      oldFileContent: oldContent,
    })
    console.log(JSON.stringify({ result }))

    expect(result.diffBlocks.length).toBe(1)
    expect(result.diffBlocksThatDidntMatch.length).toBe(0)
    expect(result.diffBlocks[0].searchContent).toBe(
      'function test() {\n  return true;\n}\n',
    )
    expect(result.diffBlocks[0].replaceContent).toBe(
      'function test() {\n  if (!condition) return false;\n  return true;\n}\n',
    )
  })

  it('should parse diff blocks without newline before closing marker', () => {
    const oldContent = 'function test() {\n  return true;\n}\n'
    const newContent = `<<<<<<< SEARCH
function test() {
  return true;
}
=======
function test() {
  if (!condition) return false;
  return true;
}>>>>>>> REPLACE`

    const result = parseAndGetDiffBlocksSingleFile({
      ...TEST_AGENT_RUNTIME_IMPL,
      newContent,
      oldFileContent: oldContent,
    })

    expect(result.diffBlocks.length).toBe(1)
    expect(result.diffBlocksThatDidntMatch.length).toBe(0)
    expect(result.diffBlocks[0].searchContent).toBe(
      'function test() {\n  return true;\n}\n',
    )
    expect(result.diffBlocks[0].replaceContent).toBe(
      'function test() {\n  if (!condition) return false;\n  return true;\n}',
    )
  })

  it('should handle multiple diff blocks with mixed newline patterns', () => {
    const oldContent = `function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}
`

    const newContent = `<<<<<<< SEARCH
function add(a, b) {
  return a + b;
}
=======
function add(a, b) {
  // Add type checking
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Invalid arguments');
  }
  return a + b;
}>>>>>>> REPLACE

<<<<<<< SEARCH
function subtract(a, b) {
  return a - b;
}
=======
function subtract(a, b) {
  // Add type checking
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Invalid arguments');
  }
  return a - b;
}
>>>>>>> REPLACE`

    const result = parseAndGetDiffBlocksSingleFile({
      ...TEST_AGENT_RUNTIME_IMPL,
      newContent,
      oldFileContent: oldContent,
    })

    expect(result.diffBlocks.length).toBe(2)
    expect(result.diffBlocksThatDidntMatch.length).toBe(0)
    expect(result.diffBlocks[0].searchContent).toBe(
      'function add(a, b) {\n  return a + b;\n}\n',
    )
    expect(result.diffBlocks[1].searchContent).toBe(
      'function subtract(a, b) {\n  return a - b;\n}\n',
    )
  })

  it('should handle empty replace content (with just one newline)', () => {
    const oldContent = `function add(a, b) {
  // This is a comment
  return a + b;
}
`

    const newContent = `<<<<<<< SEARCH
  // This is a comment
=======
>>>>>>> REPLACE`

    const result = parseAndGetDiffBlocksSingleFile({
      ...TEST_AGENT_RUNTIME_IMPL,
      newContent,
      oldFileContent: oldContent,
    })

    expect(result.diffBlocks.length).toBe(1)
    expect(result.diffBlocksThatDidntMatch.length).toBe(0)
    expect(result.diffBlocks[0].searchContent).toBe('  // This is a comment\n')
    expect(result.diffBlocks[0].replaceContent).toBe('')
  })
})
