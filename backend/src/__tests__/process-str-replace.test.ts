import { describe, expect, it } from 'bun:test'
import { processStrReplace } from '../process-str-replace'

describe('processStrReplace', () => {
  it('should replace exact string matches', async () => {
    const initialContent = 'const x = 1;\nconst y = 2;\n'
    const oldStr = 'const y = 2;'
    const newStr = 'const y = 3;'

    const result = await processStrReplace(
      'test.ts',
      [oldStr],
      [newStr],
      Promise.resolve(initialContent)
    )

    expect(result).not.toBeNull()
    expect(result?.content).toBe('const x = 1;\nconst y = 3;\n')
    expect(result?.path).toBe('test.ts')
    expect(result?.tool).toBe('str_replace')
  })

  it('should handle Windows line endings', async () => {
    const initialContent = 'const x = 1;\r\nconst y = 2;\r\n'
    const oldStr = 'const y = 2;'
    const newStr = 'const y = 3;'

    const result = await processStrReplace(
      'test.ts',
      [oldStr],
      [newStr],
      Promise.resolve(initialContent)
    )

    expect(result).not.toBeNull()
    expect(result?.content).toBe('const x = 1;\r\nconst y = 3;\r\n')
    expect(result?.patch).toContain('\r\n')
  })

  it('should handle indentation differences', async () => {
    const initialContent = '  const x = 1;\n    const y = 2;\n'
    const oldStr = 'const y = 2;'
    const newStr = 'const y = 3;'

    const result = await processStrReplace(
      'test.ts',
      [oldStr],
      [newStr],
      Promise.resolve(initialContent)
    )

    expect(result).not.toBeNull()
    expect(result?.content).toBe('  const x = 1;\n    const y = 3;\n')
  })

  it('should handle whitespace-only differences', async () => {
    const initialContent = 'const x = 1;\nconst  y  =  2;\n'
    const oldStr = 'const  y  =  2;'
    const newStr = 'const y = 3;'

    const result = await processStrReplace(
      'test.ts',
      [oldStr],
      [newStr],
      Promise.resolve(initialContent)
    )

    expect(result).not.toBeNull()
    expect(result?.content).toBe('const x = 1;\nconst y = 3;\n')
  })

  it('should return null if file content is null and oldStr is not empty', async () => {
    const result = await processStrReplace(
      'test.ts',
      ['old'],
      ['new'],
      Promise.resolve(null)
    )

    expect(result).not.toBeNull()
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('file does not exist')
    }
  })

  it('should return null if oldStr is empty and file exists', async () => {
    const result = await processStrReplace(
      'test.ts',
      [''],
      ['new'],
      Promise.resolve('content')
    )

    expect(result).not.toBeNull()
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('old string was empty')
    }
  })

  it('should create a new file if oldStr is empty and file does not exist', async () => {
    const newContent = 'const x = 1;\nconst y = 2;\n'
    const result = await processStrReplace(
      'test.ts',
      [''],
      [newContent],
      Promise.resolve(null)
    )

    expect(result).not.toBeNull()
    expect(result?.content).toBe(newContent)
    expect(result?.path).toBe('test.ts')
    expect(result?.tool).toBe('str_replace')
    expect(result?.patch).toContain('+const x = 1')
    expect(result?.patch).toContain('+const y = 2')
  })

  it('should return null if no changes were made', async () => {
    const initialContent = 'const x = 1;\nconst y = 2;\n'
    const oldStr = 'const z = 3;' // This string doesn't exist in the content
    const newStr = 'const z = 4;'

    const result = await processStrReplace(
      'test.ts',
      [oldStr],
      [newStr],
      Promise.resolve(initialContent)
    )

    expect(result).not.toBeNull()
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('old string was not found')
    }
  })

  it('should handle multiple occurrences of the same string', async () => {
    const initialContent = 'const x = 1;\nconst x = 2;\nconst x = 3;\n'
    const oldStr = 'const x'
    const newStr = 'let x'

    const result = await processStrReplace(
      'test.ts',
      [oldStr],
      [newStr],
      Promise.resolve(initialContent)
    )

    expect(result).not.toBeNull()
    expect(result?.content).toBe('let x = 1;\nlet x = 2;\nlet x = 3;\n')
  })

  it('should generate a valid patch', async () => {
    const initialContent = 'const x = 1;\nconst y = 2;\n'
    const oldStr = 'const y = 2;'
    const newStr = 'const y = 3;'

    const result = await processStrReplace(
      'test.ts',
      [oldStr],
      [newStr],
      Promise.resolve(initialContent)
    )

    expect(result).not.toBeNull()
    expect(result?.patch).toBeDefined()
    expect(result?.patch).toContain('-const y = 2;')
    expect(result?.patch).toContain('+const y = 3;')
  })

  it('should handle special characters in strings', async () => {
    const initialContent = 'const x = "hello & world";\nconst y = "<div>";\n'
    const oldStr = 'const y = "<div>";'
    const newStr = 'const y = "<span>";'

    const result = await processStrReplace(
      'test.ts',
      [oldStr],
      [newStr],
      Promise.resolve(initialContent)
    )

    expect(result).not.toBeNull()
    expect(result?.content).toBe('const x = "hello & world";\nconst y = "<span>";\n')
  })
})