import { describe, expect, it } from 'bun:test'
import { applyPatch } from 'diff'

import { getContentHash, processStrReplace } from '../process-str-replace'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const logger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const recoveryGuidance =
  'Before attempting another str_replace on this file, re-read the exact current lines with read_files'

describe('processStrReplace', () => {
  it('should replace exact string matches', async () => {
    const initialContent = 'const x = 1;\nconst y = 2;\n'
    const oldStr = 'const y = 2;'
    const newStr = 'const y = 3;'

    const result = await processStrReplace({
      path: 'test.ts',
      replacements: [
        { oldString: oldStr, newString: newStr, allowMultiple: false },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect(result).not.toBeNull()
    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toBe('const x = 1;\nconst y = 3;\n')
      expect(result.path).toBe('test.ts')
      expect(result.tool).toBe('str_replace')
    }
  })

  it('should handle Windows line endings', async () => {
    const initialContent = 'const x = 1;\r\nconst y = 2;\r\n'
    const oldStr = 'const y = 2;\r\n'
    const newStr = 'const y = 3;\r\n'

    const result = await processStrReplace({
      path: 'test.ts',
      replacements: [
        { oldString: oldStr, newString: newStr, allowMultiple: false },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect(result).not.toBeNull()
    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toBe('const x = 1;\r\nconst y = 3;\r\n')
      expect(result.patch).toContain('\r\n')
    }
  })

  it('should handle indentation differences', async () => {
    const initialContent = '  const x = 1;\n    const y = 2;\n'
    const oldStr = 'const y = 2;'
    const newStr = 'const y = 3;'

    const result = await processStrReplace({
      path: 'test.ts',
      replacements: [
        { oldString: oldStr, newString: newStr, allowMultiple: false },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect(result).not.toBeNull()
    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toBe('  const x = 1;\n    const y = 3;\n')
    }
  })

  it('should handle whitespace-only differences', async () => {
    const initialContent = 'const x = 1;\nconst  y  =  2;\n'
    const oldStr = 'const  y  =  2;'
    const newStr = 'const y = 3;'

    const result = await processStrReplace({
      path: 'test.ts',
      replacements: [
        { oldString: oldStr, newString: newStr, allowMultiple: false },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect(result).not.toBeNull()
    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toBe('const x = 1;\nconst y = 3;\n')
    }
  })

  it('should return error if file content is null and oldStr is not empty', async () => {
    const result = await processStrReplace({
      path: 'test.ts',
      replacements: [
        { oldString: 'old', newString: 'new', allowMultiple: false },
      ],
      initialContentPromise: Promise.resolve(null),
      logger,
    })

    expect(result).not.toBeNull()
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('file does not exist')
      expect(result.error).not.toContain(recoveryGuidance)
    }
  })

  it('should return error if oldStr is empty and file exists', async () => {
    const result = await processStrReplace({
      path: 'test.ts',
      replacements: [{ oldString: '', newString: 'new', allowMultiple: false }],
      initialContentPromise: Promise.resolve('content'),
      logger,
    })

    expect(result).not.toBeNull()
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('old string was empty')
      expect(result.error).toContain(recoveryGuidance)
    }
  })

  it('should return error if no changes were made', async () => {
    const initialContent = 'const x = 1;\nconst y = 2;\n'
    const oldStr = 'const z = 3;' // This string doesn't exist in the content
    const newStr = 'const z = 4;'

    const result = await processStrReplace({
      path: 'test.ts',
      replacements: [
        { oldString: oldStr, newString: newStr, allowMultiple: false },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect(result).not.toBeNull()
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain(
        'The old string "const z = 3;" was not found',
      )
      expect(result.error).toContain(recoveryGuidance)
    }
  })

  it('should handle multiple occurrences of the same string with allowMultiple: true', async () => {
    const initialContent = 'const x = 1;\nconst x = 2;\nconst x = 3;\n'
    const oldStr = 'const x'
    const newStr = 'let x'

    const result = await processStrReplace({
      path: 'test.ts',
      replacements: [
        { oldString: oldStr, newString: newStr, allowMultiple: true },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect(result).not.toBeNull()
    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toBe('let x = 1;\nlet x = 2;\nlet x = 3;\n')
    }
  })

  it('should generate a valid patch', async () => {
    const initialContent = 'const x = 1;\nconst y = 2;\n'
    const oldStr = 'const y = 2;'
    const newStr = 'const y = 3;'

    const result = await processStrReplace({
      path: 'test.ts',
      replacements: [
        { oldString: oldStr, newString: newStr, allowMultiple: false },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect(result).not.toBeNull()
    expect('content' in result).toBe(true)
    if ('content' in result) {
      const patch = result.patch
      expect(patch).toBeDefined()
      expect(patch).toContain('-const y = 2;')
      expect(patch).toContain('+const y = 3;')
    }
  })

  it('should handle special characters in strings', async () => {
    const initialContent = 'const x = "hello & world";\nconst y = "<div>";\n'
    const oldStr = 'const y = "<div>";'
    const newStr = 'const y = "<span>";'

    const result = await processStrReplace({
      path: 'test.ts',
      replacements: [
        { oldString: oldStr, newString: newStr, allowMultiple: false },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect(result).not.toBeNull()
    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toBe(
        'const x = "hello & world";\nconst y = "<span>";\n',
      )
    }
  })

  it('should continue processing other replacements even if one fails', async () => {
    const initialContent = 'const x = 1;\nconst y = 2;\nconst z = 3;\n'
    const replacements = [
      {
        oldString: 'const x = 1;',
        newString: 'const x = 10;',
        allowMultiple: false,
      }, // This exists
      {
        oldString: 'const w = 4;',
        newString: 'const w = 40;',
        allowMultiple: false,
      }, // This doesn't exist
      {
        oldString: 'const z = 3;',
        newString: 'const z = 30;',
        allowMultiple: false,
      }, // This also exists
    ]

    const result = await processStrReplace({
      path: 'test.ts',
      replacements,
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect(result).not.toBeNull()
    expect('content' in result).toBe(true)
    if ('content' in result) {
      // Should have applied the successful replacements
      expect(result.content).toBe(
        'const x = 10;\nconst y = 2;\nconst z = 30;\n',
      )
      expect(
        result.messages.some((msg) =>
          msg.includes(
            'The old string "const w = 4;" was not found in the file, skipping. Please try again with a different old string that matches the file content exactly.',
          ),
        ),
      ).toBe(true)
    }
  })

  // New comprehensive tests for allowMultiple functionality
  describe('allowMultiple functionality', () => {
    it('should error when multiple occurrences exist and allowMultiple is false', async () => {
      const initialContent = 'const x = 1;\nconst x = 2;\nconst x = 3;\n'
      const oldStr = 'const x'
      const newStr = 'let x'

      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          { oldString: oldStr, newString: newStr, allowMultiple: false },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect(result).not.toBeNull()
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('Found 3 occurrences')
        expect(result.error).toContain('set allowMultiple to true')
        expect(result.error).toContain(
          'Occurrence ranges for read_files.ranges recovery:',
        )
        expect(result.error).toContain('Occurrence 1: lines 1-1')
      }
    })

    it('should replace all occurrences when allowMultiple is true', async () => {
      const initialContent = 'foo bar foo baz foo'
      const oldStr = 'foo'
      const newStr = 'FOO'

      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          { oldString: oldStr, newString: newStr, allowMultiple: true },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect(result).not.toBeNull()
      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toBe('FOO bar FOO baz FOO')
      }
    })

    it('should handle single occurrence with allowMultiple: true', async () => {
      const initialContent = 'const x = 1;\nconst y = 2;\n'
      const oldStr = 'const y = 2;'
      const newStr = 'const y = 3;'

      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          { oldString: oldStr, newString: newStr, allowMultiple: true },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect(result).not.toBeNull()
      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toBe('const x = 1;\nconst y = 3;\n')
      }
    })

    it('should handle mixed allowMultiple settings in multiple replacements', async () => {
      const initialContent = 'foo bar foo\nbaz baz baz\nqux qux'
      const replacements = [
        { oldString: 'foo', newString: 'FOO', allowMultiple: true }, // Replace all 'foo'
        { oldString: 'baz', newString: 'BAZ', allowMultiple: false }, // Should error on multiple 'baz'
        { oldString: 'qux qux', newString: 'QUX', allowMultiple: false }, // Single occurrence, should work
      ]

      const result = await processStrReplace({
        path: 'test.ts',
        replacements,
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect(result).not.toBeNull()
      expect('content' in result).toBe(true)
      if ('content' in result) {
        // Should have applied foo->FOO and qux qux->QUX, but not baz->BAZ

        expect(result.content).toBe('FOO bar FOO\nbaz baz baz\nQUX')
        expect(result.messages).toHaveLength(1)
        expect(result.messages[0]).toContain('Found 3 occurrences of "baz"')
        expect(result.messages[0]).toContain('set allowMultiple to true')
      }
    })

    it('should replace multiple lines with allowMultiple: true', async () => {
      const initialContent = `function test() {
  console.log('debug');
}
function test2() {
  console.log('debug');
}
function test3() {
  console.log('info');
}`
      const oldStr = "console.log('debug');"
      const newStr = '// removed debug log'

      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          { oldString: oldStr, newString: newStr, allowMultiple: true },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect(result).not.toBeNull()
      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toContain('// removed debug log')
        // Should have replaced both debug logs but not the info log
        expect((result.content.match(/removed debug log/g) || []).length).toBe(
          2,
        )
        expect(result.content).toContain("console.log('info');")
      }
    })

    it('should handle empty new string with allowMultiple: true (deletion)', async () => {
      const initialContent = 'remove this, keep this, remove this, keep this'
      const oldStr = 'remove this, '
      const newStr = ''

      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          { oldString: oldStr, newString: newStr, allowMultiple: true },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect(result).not.toBeNull()
      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toBe('keep this, keep this')
      }
    })

    it('should handle allowMultiple with indentation matching', async () => {
      const initialContent = `  if (condition) {
    doSomething();
  }
  if (condition) {
    doSomething();
  }`
      const oldStr = 'doSomething();'
      const newStr = 'doSomethingElse();'

      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          { oldString: oldStr, newString: newStr, allowMultiple: true },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect(result).not.toBeNull()
      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toContain('doSomethingElse();')
        expect((result.content.match(/doSomethingElse/g) || []).length).toBe(2)
      }
    })

    it('should handle zero occurrences with allowMultiple: true', async () => {
      const initialContent = 'const x = 1;\nconst y = 2;\n'
      const oldStr = 'const z = 3;' // This string doesn't exist
      const newStr = 'const z = 4;'

      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          { oldString: oldStr, newString: newStr, allowMultiple: true },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect(result).not.toBeNull()
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain(
          'The old string "const z = 3;" was not found',
        )
      }
    })
  })

  it('should handle applying multiple replacements on nearby lines', async () => {
    const initialContent = 'line 1\nline 2\nline 3\n'
    const replacements = [
      {
        oldString: 'line 2\n',
        newString: 'this is a new line\n',
        allowMultiple: false,
      },
      {
        oldString: 'line 3\n',
        newString: 'new line 3\n',
        allowMultiple: false,
      },
    ]

    const result = await processStrReplace({
      path: 'test.ts',
      replacements,
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('content' in result).toBe(true)
    const successResult = result as { content: string; patch: string }
    expect(applyPatch(initialContent, successResult.patch)).toBe(
      'line 1\nthis is a new line\nnew line 3\n',
    )
  })

  it('should handle double dollar signs correctly', async () => {
    const initialContent = 'line 1\nhello $world!\nline 2\n'
    const oldStr = 'hello $world!\n'
    const newStr = 'hello $$world!\n'

    const result = await processStrReplace({
      path: 'test.ts',
      replacements: [
        { oldString: oldStr, newString: newStr, allowMultiple: false },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect(result).not.toBeNull()
    const successResult = result as { content: string }
    expect(successResult.content).toBe('line 1\nhello $$world!\nline 2\n')
  })

  it('should provide fuzzy matching diagnostics when oldString has a typo', async () => {
    const initialContent = 'const firstVar = 1;\nconst secondVar = 2;\nconst thirdVar = 3;\n'
    const oldStr = 'const secondVarr = 2;' // Typo with extra 'r'
    const newStr = 'const secondVar = 20;'

    const result = await processStrReplace({
      path: 'test.ts',
      replacements: [
        { oldString: oldStr, newString: newStr, allowMultiple: false },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect(result).not.toBeNull()
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('The old string "const secondVarr = 2;" was not found')
      expect(result.error).toContain('Closest candidate ranges for read_files.ranges recovery:')
      expect(result.error).toContain('Candidate 1: lines 2-2')
      expect(result.error).toContain(
        'Recovery read: read_files ranges: [{ path, startLine: 2, endLine: 2 }]',
      )
      expect(result.error).toContain('const secondVar = 2;')
    }
  })

  it('should provide multiple candidate ranges for large-file recovery', async () => {
    const initialContent = Array.from({ length: 80 }, (_, index) =>
      index === 30
        ? 'const targetAlpha = makeValue(1);'
        : index === 60
          ? 'const targetAlpha = makeValue(2);'
          : `const filler${index} = ${index};`,
    ).join('\n')

    const result = await processStrReplace({
      path: 'large.ts',
      replacements: [
        {
          oldString: 'const targetAlpha = makeValue(3);',
          newString: 'const targetAlpha = makeValue(4);',
          allowMultiple: false,
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('Closest candidate ranges for read_files.ranges recovery:')
      expect(result.error).toContain('Candidate 1: lines')
      expect(result.error).toContain('Candidate 2: lines')
      expect(result.error).toContain('targetAlpha')
    }
  })

  it('should reject naked str_replace on large files before editing', async () => {
    const initialContent = Array.from({ length: 1_001 }, (_, index) =>
      index === 500 ? 'const target = 1;' : `const filler${index} = ${index};`,
    ).join('\n')

    const result = await processStrReplace({
      path: 'large.ts',
      replacements: [
        {
          oldString: 'const target = 1;',
          newString: 'const target = 2;',
          allowMultiple: false,
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('Large-file edit blocked for large.ts')
      expect(result.error).toContain('Do not use naked str_replace on large files')
      expect(result.error).toContain('read_files.ranges')
    }
  })

  it('should allow large-file str_replace when basedOnRead hash matches', async () => {
    const lines = Array.from({ length: 1_001 }, (_, index) =>
      index === 500 ? 'const target = 1;' : `const filler${index} = ${index};`,
    )
    const initialContent = lines.join('\n')
    const rangeContent = lines.slice(500, 501).join('\n')

    const result = await processStrReplace({
      path: 'large.ts',
      replacements: [
        {
          oldString: 'const target = 1;',
          newString: 'const target = 2;',
          allowMultiple: false,
          basedOnRead: {
            startLine: 501,
            endLine: 501,
            hash: getContentHash(rangeContent),
          },
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toContain('const target = 2;')
      expect(result.content).not.toContain('const target = 1;')
    }
  })

  it('should restrict basedOnRead replacements to the validated range', async () => {
    const lines = Array.from({ length: 1_001 }, (_, index) =>
      index === 100 || index === 500
        ? 'const target = 1;'
        : `const filler${index} = ${index};`,
    )
    const initialContent = lines.join('\n')
    const rangeContent = lines.slice(500, 501).join('\n')

    const result = await processStrReplace({
      path: 'large.ts',
      replacements: [
        {
          oldString: 'const target = 1;',
          newString: 'const target = 2;',
          allowMultiple: false,
          basedOnRead: {
            startLine: 501,
            endLine: 501,
            hash: getContentHash(rangeContent),
          },
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content.split('\n')[100]).toBe('const target = 1;')
      expect(result.content.split('\n')[500]).toBe('const target = 2;')
    }
  })

  it('should apply multiple replacements in one validated large-file range', async () => {
    const lines = Array.from({ length: 1_001 }, (_, index) =>
      index === 500
        ? 'const first = 1;\nconst second = 1;'
        : `const filler${index} = ${index};`,
    )
    const initialContent = lines.join('\n')
    const rangeContent = lines.slice(500, 501).join('\n')
    const basedOnRead = {
      startLine: 501,
      endLine: 502,
      hash: getContentHash(rangeContent),
    }

    const result = await processStrReplace({
      path: 'large.ts',
      replacements: [
        {
          oldString: 'const first = 1;',
          newString: 'const first = 2;',
          allowMultiple: false,
          basedOnRead,
        },
        {
          oldString: 'const second = 1;',
          newString: 'const second = 2;',
          allowMultiple: false,
          basedOnRead,
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toContain('const first = 2;\nconst second = 2;')
    }
  })

  it('should reject line-count-changing basedOnRead replacements', async () => {
    const lines = Array.from({ length: 1_001 }, (_, index) =>
      index === 500
        ? 'const first = 1;\nconst second = 1;'
        : `const filler${index} = ${index};`,
    )
    const initialContent = lines.join('\n')
    const rangeContent = lines.slice(500, 501).join('\n')

    const result = await processStrReplace({
      path: 'large.ts',
      replacements: [
        {
          oldString: 'const first = 1;',
          newString: 'const first = 2;\nconst inserted = true;',
          allowMultiple: false,
          basedOnRead: {
            startLine: 501,
            endLine: 502,
            hash: getContentHash(rangeContent),
          },
        },
        {
          oldString: 'const second = 1;',
          newString: 'const second = 2;',
          allowMultiple: false,
          basedOnRead: {
            startLine: 501,
            endLine: 502,
            hash: getContentHash(rangeContent),
          },
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('basedOnRead str_replace must preserve line count')
      expect(result.error).not.toContain('const inserted = true;')
    }
  })

  it('should accept multi-line CRLF range hashes from read_files', async () => {
    const lines = Array.from({ length: 1_001 }, (_, index) =>
      index === 500
        ? 'const target = 1;'
        : index === 501
          ? 'const neighbor = 1;'
          : `const filler${index} = ${index};`,
    )
    const initialContent = lines.join('\r\n')
    const rangeContent = lines.slice(500, 502).join('\r\n')

    const result = await processStrReplace({
      path: 'large.ts',
      replacements: [
        {
          oldString: 'const target = 1;\r\nconst neighbor = 1;',
          newString: 'const target = 2;\r\nconst neighbor = 1;',
          allowMultiple: false,
          basedOnRead: {
            startLine: 501,
            endLine: 502,
            hash: getContentHash(rangeContent),
          },
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toContain('const target = 2;\r\nconst neighbor = 1;')
      expect(result.content).toContain('\r\n')
    }
  })

  it('should reject stale basedOnRead hashes before editing large files', async () => {
    const lines = Array.from({ length: 1_001 }, (_, index) =>
      index === 500 ? 'const target = 1;' : `const filler${index} = ${index};`,
    )
    const initialContent = lines.join('\n')

    const result = await processStrReplace({
      path: 'large.ts',
      replacements: [
        {
          oldString: 'const target = 1;',
          newString: 'const target = 2;',
          allowMultiple: false,
          basedOnRead: {
            startLine: 501,
            endLine: 501,
            hash: getContentHash('const target = 0;'),
          },
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('the basedOnRead range is stale')
      expect(result.error).toContain('Expected sha256:')
      expect(result.error).toContain('Re-read with read_files ranges')
    }
  })
})
