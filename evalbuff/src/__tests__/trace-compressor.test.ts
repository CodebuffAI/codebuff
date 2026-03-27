import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { compressTrace, cleanupTraceDir } from '../trace-compressor'

let traceDir: string

beforeEach(() => {
  traceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalbuff-trace-test-'))
})

afterEach(() => {
  cleanupTraceDir(traceDir)
})

describe('compressTrace', () => {
  it('leaves short traces unchanged', () => {
    const trace = 'Thinking about the problem...\nLooking at the code.\nDone.'
    const result = compressTrace(trace, traceDir)

    expect(result.inline).toBe(trace)
    expect(fs.readdirSync(traceDir).filter((f) => f.endsWith('.txt'))).toHaveLength(0)
  })

  it('extracts large code fence blocks to files', () => {
    const largeBlock = 'x'.repeat(500)
    const trace = `Thinking about the problem...
\`\`\`
${largeBlock}
\`\`\`
Done.`

    const result = compressTrace(trace, traceDir)

    // The inline trace should have a pointer instead of the large block
    expect(result.inline).toContain('[Code block stored in:')
    expect(result.inline).toMatch(/\d+ chars/)
    expect(result.inline).not.toContain(largeBlock)

    // The file should contain the block
    const files = fs.readdirSync(traceDir).filter((f) => f.endsWith('.txt'))
    expect(files).toHaveLength(1)
    const fileContent = fs.readFileSync(path.join(traceDir, files[0]), 'utf-8')
    expect(fileContent).toContain(largeBlock)
  })

  it('keeps small code fence blocks inline', () => {
    const trace = `Looking at code:
\`\`\`
const x = 1
\`\`\`
Done.`

    const result = compressTrace(trace, traceDir)

    expect(result.inline).toContain('const x = 1')
    expect(result.inline).not.toContain('[Code block stored in:')
    expect(fs.readdirSync(traceDir).filter((f) => f.endsWith('.txt'))).toHaveLength(0)
  })

  it('extracts large indented blocks', () => {
    const indentedLines = Array.from({ length: 20 }, (_, i) => `    line ${i}: ${'content '.repeat(10)}`).join('\n')
    const trace = `Running command:\n${indentedLines}\nDone.`

    const result = compressTrace(trace, traceDir)

    expect(result.inline).toContain('[Indented block stored in:')
    expect(result.inline).toContain('20 lines')

    const files = fs.readdirSync(traceDir).filter((f) => f.endsWith('.txt'))
    expect(files).toHaveLength(1)
  })

  it('handles JSON-lines format (Claude streaming)', () => {
    const largeContent = 'x'.repeat(500)
    const events = [
      JSON.stringify({ type: 'tool_use', name: 'Read', input: { path: 'src/index.ts' } }),
      JSON.stringify({ type: 'tool_result', content: largeContent }),
      JSON.stringify({ type: 'text', content: 'Now I understand the code.' }),
    ]
    const trace = events.join('\n')

    const result = compressTrace(trace, traceDir)

    // Tool use should still be inline
    expect(result.inline).toContain('"name":"Read"')
    // Large tool result should be extracted
    expect(result.inline).toContain('[Stored in:')
    expect(result.inline).not.toContain(largeContent)
    // Text event should be inline
    expect(result.inline).toContain('Now I understand the code')

    const files = fs.readdirSync(traceDir).filter((f) => f.endsWith('.txt'))
    expect(files).toHaveLength(1)
  })

  it('keeps small JSON tool results inline', () => {
    const events = [
      JSON.stringify({ type: 'tool_use', name: 'Read', input: { path: 'a.ts' } }),
      JSON.stringify({ type: 'tool_result', content: 'short result' }),
    ]
    const trace = events.join('\n')

    const result = compressTrace(trace, traceDir)

    expect(result.inline).toContain('short result')
    expect(result.inline).not.toContain('[Stored in:')
  })

  it('extracts multiple large blocks', () => {
    const block1 = 'a'.repeat(500)
    const block2 = 'b'.repeat(500)
    const trace = `Step 1:
\`\`\`
${block1}
\`\`\`
Step 2:
\`\`\`
${block2}
\`\`\`
Done.`

    const result = compressTrace(trace, traceDir)

    const files = fs.readdirSync(traceDir).filter((f) => f.endsWith('.txt'))
    expect(files).toHaveLength(2)
    expect(result.inline).not.toContain(block1)
    expect(result.inline).not.toContain(block2)
  })

  it('generates a content summary in the pointer', () => {
    const jsonBlock = '{\n  "name": "test",\n' + '  "data": "x",\n'.repeat(50) + '}'
    const trace = `Result:\n\`\`\`\n${jsonBlock}\n\`\`\`\nDone.`

    const result = compressTrace(trace, traceDir)

    // Should have a summary mentioning it's a code block
    expect(result.inline).toContain('code block')
  })
})

describe('cleanupTraceDir', () => {
  it('removes the directory and all files', () => {
    fs.writeFileSync(path.join(traceDir, 'test.txt'), 'content')
    expect(fs.existsSync(traceDir)).toBe(true)

    cleanupTraceDir(traceDir)

    expect(fs.existsSync(traceDir)).toBe(false)
  })

  it('does not throw on non-existent directory', () => {
    cleanupTraceDir('/tmp/nonexistent-evalbuff-trace-dir-xyz')
    // Should not throw
  })
})
