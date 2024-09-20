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
    const patch = fs.readFileSync('test/__mock-data__/delete-comment2/patch.ts', 'utf8')
    const expectedResult = fs.readFileSync(
      'test/__mock-data__/delete-comment2/expected.ts',
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
})
