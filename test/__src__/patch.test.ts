import { expect, describe, it } from 'bun:test'
import { applyPatch } from 'common/util/patch'
import fs from 'fs'

describe('applyPatch', () => {
  it('should apply a simple patch correctly', () => {
    const oldContent = 'Hello, world!'
    const patch = '@@ -1 +1 @@\n-Hello, world!\n+Hello, patched world!'
    const expectedResult = 'Hello, patched world!'

    const result = applyPatch(oldContent, patch)
    expect(result).toBe(expectedResult)
  })

  it('should handle multiple hunks in a patch', () => {
    const oldContent = ['Line 1', 'Line 2', 'Line 3', 'Line 4'].join('\n')
    const patch = [
      '@@ -1,2 +1,2 @@',
      '-Line 1',
      '+Updated Line 1',
      ' Line 2',
      '@@ -4 +4 @@',
      '-Line 4',
      '+Updated Line 4',
    ].join('\n')
    const expectedResult = [
      'Updated Line 1',
      'Line 2',
      'Line 3',
      'Updated Line 4',
    ].join('\n')

    const result = applyPatch(oldContent, patch)
    expect(result).toBe(expectedResult)
  })

  it('should handle context lines correctly', () => {
    const oldContent = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'].join(
      '\n'
    )
    const patch = [
      '@@ -2,3 +2,3 @@',
      ' Line 2',
      '-Line 3',
      '+Updated Line 3',
      ' Line 4',
    ].join('\n')
    const expectedResult = [
      'Line 1',
      'Line 2',
      'Updated Line 3',
      'Line 4',
      'Line 5',
    ].join('\n')

    const result = applyPatch(oldContent, patch)
    expect(result).toBe(expectedResult)
  })

  it('should rearrange functions in patch', () => {
    const oldContent = fs.readFileSync(
      'test/__mock-data__/patch/old.ts',
      'utf8'
    )
    const patch = fs.readFileSync('test/__mock-data__/patch/patch.ts', 'utf8')
    const expectedResult = fs.readFileSync(
      'test/__mock-data__/patch/expected.ts',
      'utf8'
    )

    const result = applyPatch(oldContent, patch)
    expect(result).toBe(expectedResult)
  })

  it('should handle complex update to graph.js', () => {
    const oldContent = fs.readFileSync(
      'test/__mock-data__/graph/old.ts',
      'utf8'
    )
    const patch = fs.readFileSync('test/__mock-data__/graph/patch.ts', 'utf8')
    const expectedResult = fs.readFileSync(
      'test/__mock-data__/graph/expected.ts',
      'utf8'
    )

    const result = applyPatch(oldContent, patch)
    expect(result).toBe(expectedResult)
  })

  it('should handle file edits to delete-comment2', () => {
    const oldContent = fs.readFileSync(
      'test/__mock-data__/delete-comment2/old.ts',
      'utf8'
    )
    const patch = fs.readFileSync(
      'test/__mock-data__/delete-comment2/patch.ts',
      'utf8'
    )
    const expectedResult = fs.readFileSync(
      'test/__mock-data__/delete-comment2/expected.ts',
      'utf8'
    )

    const result = applyPatch(oldContent, patch)
    expect(result).toBe(expectedResult)
  })

  it('should handle no ending new line in inbox-screen', () => {
    const oldContent = fs.readFileSync(
      'test/__mock-data__/inbox-screen/old.tsx',
      'utf8'
    )
    const patch = fs.readFileSync(
      'test/__mock-data__/inbox-screen/patch',
      'utf8'
    )
    const expectedResult = fs.readFileSync(
      'test/__mock-data__/inbox-screen/expected.tsx',
      'utf8'
    )

    const result = applyPatch(oldContent, patch)
    expect(result).toBe(expectedResult)
  })

  describe('slightly wrong patches', () => {
    it('should handle incorrect line numbers', async () => {
      const oldContent = ['line1', 'line2', 'line3', 'line4', ''].join('\n')
      const newContent = ['line1', 'line2', 'modified line3', 'line4', ''].join(
        '\n'
      )
      const incorrectPatch = [
        '@@ -2,2 +2,2 @@',
        ' line2',
        '-line3',
        '+modified line3',
      ].join('\n')

      const result = applyPatch(oldContent, incorrectPatch)
      expect(result).toEqual(newContent)
    })

    it('should handle slightly incorrect context lines', async () => {
      const oldContent = ['line1', 'line2', 'line3', 'line4', ''].join('\n')
      const newContent = ['line1', 'line2', 'modified line3', 'line4', ''].join(
        '\n'
      )
      const newContent2 = ['line1', 'lne2', 'modified line3', 'line4', ''].join(
        '\n'
      )
      const incorrectPatch = [
        '@@ -1,4 +1,4 @@',
        ' line1',
        ' lne2',
        '-line3',
        '+modified line3',
        ' line4',
      ].join('\n')

      const result = applyPatch(oldContent, incorrectPatch)
      expect(result === newContent || result === newContent2).toBe(true)
    })
  })

  it('should handle patches with context lines', () => {
    const oldContent = 'line1\nline2\nline3\nline4\n'
    const patch = '@@ -1,4 +1,4 @@\n line1\n-line2\n+newline2\n line3\n line4\n'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('line1\nnewline2\nline3\nline4\n')
  })

  it('should handle multiple hunks in a patch', () => {
    const oldContent = 'line1\nline2\nline3\nline4\n'
    const patch =
      '@@ -1,2 +1,2 @@\n line1\n-line2\n+newline2\n@@ -4,1 +4,1 @@\n-line4\n+newline4\n'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('line1\nnewline2\nline3\nnewline4\n')
  })

  it('should handle patches with line additions', () => {
    const oldContent = 'line1\nline2\nline3\n'
    const patch = '@@ -2,1 +2,2 @@\n line2\n+newline\n'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('line1\nline2\nnewline\nline3\n')
  })

  it('should handle patches with line deletions', () => {
    const oldContent = 'line1\nline2\nline3\n'
    const patch = '@@ -2,2 +2,1 @@\n line2\n-line3\n'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('line1\nline2\n')
  })

  it('should handle patches with whitespace changes', () => {
    const oldContent = 'line1\n  line2\nline3\n'
    const patch = '@@ -2,1 +2,1 @@\n-  line2\n+    line2\n'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('line1\n    line2\nline3\n')
  })

  it('should handle patches with empty lines', () => {
    const oldContent = 'line1\n\nline3\n'
    const patch = '@@ -2,1 +2,1 @@\n-\n+newline2\n'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('line1\nnewline2\nline3\n')
  })

  it('should handle patches with hunk headers containing function names', () => {
    const oldContent = 'function foo() {\n  return 1;\n}\n'
    const patch =
      '@@ -1,3 +1,3 @@ function foo() {\n function foo() {\n-  return 1;\n+  return 2;\n }\n'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('function foo() {\n  return 2;\n}\n')
  })

  it('should handle patches with partial line matches', () => {
    const oldContent = 'line1\n  line2  \nline3\n'
    const patch = '@@ -2,1 +2,1 @@\n-  line2  \n+  newline2  \n'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('line1\n  newline2  \nline3\n')
  })

  it('should handle patches with no line endings', () => {
    const oldContent = 'line1\nline2\nline3'
    const patch = '@@ -3,1 +3,1 @@\n-line3\n+newline3'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('line1\nline2\nnewline3')
  })

  it('should handle patches with Windows line endings', () => {
    const oldContent = 'line1\r\nline2\r\nline3\r\n'
    const patch = '@@ -2,1 +2,1 @@\n-line2\r\n+newline2\r\n'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('line1\r\nnewline2\r\nline3\r\n')
  })

  it('should handle patches with mixed line endings', () => {
    const oldContent = 'line1\nline2\r\nline3\n'
    const patch = '@@ -2,1 +2,1 @@\n-line2\r\n+newline2\n'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('line1\nnewline2\nline3\n')
  })

  it('should handle patches with indentation variations', () => {
    const oldContent = '  line1\n    line2\n  line3\n'
    const patch = '@@ -2,1 +2,1 @@\n-    line2\n+      line2\n'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('  line1\n      line2\n  line3\n')
  })

  it('should handle patches with special characters', () => {
    const oldContent = 'line1\nline2 // comment\nline3\n'
    const patch =
      '@@ -2,1 +2,1 @@\n-line2 // comment\n+line2 /* new comment */\n'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('line1\nline2 /* new comment */\nline3\n')
  })

  it('should handle patches with multiple context matches', () => {
    const oldContent = 'line1\nline2\nline1\nline2\n'
    const patch = '@@ -1,2 +1,2 @@\n line1\n-line2\n+newline2\n'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('line1\nnewline2\nline1\nline2\n')
  })

  it('should handle patches with no context lines', () => {
    const oldContent = 'line1\nline2\nline3\n'
    const patch = '@@ -2,1 +2,1 @@\n-line2\n+newline2\n'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('line1\nnewline2\nline3\n')
  })

  it('should handle patches with context lines that match multiple places', () => {
    const oldContent = 'line1\nline2\nline1\nline2\nline3\n'
    const patch = '@@ -1,2 +1,2 @@\n line1\n-line2\n+newline2\n'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('line1\nnewline2\nline1\nline2\nline3\n')
  })

  it('should handle patches with missing newline at end of file', () => {
    const oldContent = 'line1\nline2' // No trailing newline
    const patch = '@@ -2,1 +2,1 @@\n-line2\n+newline2' // No trailing newline in patch

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('line1\nnewline2')
  })

  it('should handle patches with escaped characters', () => {
    const oldContent = 'line1\nline2\t\nline3\n'
    const patch = '@@ -2,1 +2,1 @@\n-line2\t\n+line2\\t\\n\n'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('line1\nline2\\t\\n\nline3\n')
  })

  it('should handle patches with unicode characters', () => {
    const oldContent = 'line1\n🚀 line2\nline3\n'
    const patch = '@@ -2,1 +2,1 @@\n-🚀 line2\n+✨ line2\n'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('line1\n✨ line2\nline3\n')
  })

  it('should handle patches with very long lines', () => {
    const longLine = 'x'.repeat(1000)
    const oldContent = `line1\n${longLine}\nline3\n`
    const patch = `@@ -2,1 +2,1 @@\n-${longLine}\n+${'y'.repeat(1000)}\n`

    const result = applyPatch(oldContent, patch)

    expect(result).toBe(`line1\n${'y'.repeat(1000)}\nline3\n`)
  })

  it('should handle patches with invalid line numbers gracefully', () => {
    const oldContent = 'line1\nline2\nline3\n'
    const patch = '@@ -99,1 +99,1 @@\n-line2\n+newline2\n'

    const result = applyPatch(oldContent, patch)

    expect(result).toBe('line1\nnewline2\nline3\n')
  })
})
