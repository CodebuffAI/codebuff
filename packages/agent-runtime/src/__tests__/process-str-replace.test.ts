import { describe, expect, it } from 'bun:test'
import { applyPatch } from 'diff'

import {
  encodeReadCapabilityToken,
  getContentHash,
  processStrReplace,
} from '../process-str-replace'

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

  it('preserves mixed line endings in untouched text', async () => {
    const initialContent =
      'const crlf = 1;\r\nconst lf = 2;\nconst target = 3;\r\n'

    const result = await processStrReplace({
      path: 'mixed.ts',
      replacements: [
        {
          oldString: 'const target = 3;',
          newString: 'const target = 4;',
          allowMultiple: false,
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toBe(
        'const crlf = 1;\r\nconst lf = 2;\nconst target = 4;\r\n',
      )
    }
  })

  it('preserves the original line ending of modified lines in mixed files', async () => {
    const initialContent =
      'const crlf = 1;\r\nconst lf = 2;\nconst another = 3;\r\n'

    const result = await processStrReplace({
      path: 'mixed.ts',
      replacements: [
        {
          oldString: 'const lf = 2;',
          newString: 'const lf = 20;',
          allowMultiple: false,
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toBe(
        'const crlf = 1;\r\nconst lf = 20;\nconst another = 3;\r\n',
      )
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
    const initialContent =
      'const value = 1;\nconst value = 2;\nconst value = 3;\n'
    const oldStr = 'const value'
    const newStr = 'let value'

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
      expect(result.content).toBe(
        'let value = 1;\nlet value = 2;\nlet value = 3;\n',
      )
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

  it('should continue processing other replacements even if one fails by default', async () => {
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
      expect(result.failedReplacementCount).toBe(1)
      expect(
        result.messages.some(
          (msg) =>
            msg.includes(
              'The old string "const w = 4;" was not found in the file, skipping.',
            ) &&
            msg.includes('Please re-read the current file/range and try again'),
        ),
      ).toBe(true)
    }
  })

  it('should abort an entire small-file batch when atomic is true', async () => {
    const initialContent = 'const x = 1;\nconst y = 2;\nconst z = 3;\n'
    const replacements = [
      {
        oldString: 'const x = 1;',
        newString: 'const x = 10;',
        allowMultiple: false,
      },
      {
        oldString: 'const w = 4;',
        newString: 'const w = 40;',
        allowMultiple: false,
      },
      {
        oldString: 'const z = 3;',
        newString: 'const z = 30;',
        allowMultiple: false,
      },
    ]

    const result = await processStrReplace({
      path: 'test.ts',
      replacements,
      atomic: true,
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('Atomic str_replace batch aborted')
      expect(result.error).toContain('NO changes were made')
      expect(result.error).toContain('Replacement 2/3 failed:')
      expect(result.error).toContain('const w = 4;')
      expect(result.error).not.toContain('+const x = 10;')
      expect(result.error).not.toContain('+const z = 30;')
    }
  })

  // New comprehensive tests for allowMultiple functionality
  describe('allowMultiple functionality', () => {
    it('should error when multiple occurrences exist and allowMultiple is false', async () => {
      const initialContent =
        'const value = 1;\nconst value = 2;\nconst value = 3;\n'
      const oldStr = 'const value'
      const newStr = 'let value'

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
      const initialContent = 'replace foo bar replace foo baz replace foo'
      const oldStr = 'replace foo'
      const newStr = 'REPLACED'

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
        expect(result.content).toBe('REPLACED bar REPLACED baz REPLACED')
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
      const initialContent =
        'alpha token bar alpha token\nbeta token beta token beta token\nqux qux'
      const replacements = [
        { oldString: 'alpha token', newString: 'ALPHA', allowMultiple: true }, // Replace all 'alpha token'
        { oldString: 'beta token', newString: 'BETA', allowMultiple: false }, // Should error on multiple 'beta token'
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
        // Should have applied alpha token->ALPHA and qux qux->QUX, but not beta token->BETA

        expect(result.content).toBe(
          'ALPHA bar ALPHA\nbeta token beta token beta token\nQUX',
        )
        expect(result.failedReplacementCount).toBe(1)
        expect(result.messages).toHaveLength(2)
        expect(result.messages[0]).toContain('Partial str_replace applied')
        expect(result.messages[1]).toContain(
          'Found 3 occurrences of "beta token"',
        )
        expect(result.messages[1]).toContain('set allowMultiple to true')
      }
    })

    it('should refuse tiny anchors with multiple matches even when allowMultiple is true', async () => {
      const initialContent = 'foo bar foo baz foo'

      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          { oldString: 'foo', newString: 'FOO', allowMultiple: true },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect(result).not.toBeNull()
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('Refusing to apply tiny oldString')
        expect(result.error).toContain('shorter than 10 characters')
        expect(result.error).toContain('matches 3 locations')
        expect(result.error).toContain('allowMultiple=true cannot override')
        expect(result.error).toContain(
          'Occurrence ranges for read_files.ranges recovery:',
        )
      }
    })

    it('should refuse tiny anchors with multiple matches before standard multi-match guidance', async () => {
      const initialContent = 'baz baz baz'

      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          { oldString: 'baz', newString: 'BAZ', allowMultiple: false },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect(result).not.toBeNull()
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('Refusing to apply tiny oldString')
        expect(result.error).not.toContain('set allowMultiple to true')
        expect(result.error).toContain('pass occurrenceIndex')
      }
    })

    it('should allow repeated anchors at the tiny-anchor length boundary', async () => {
      const initialContent = '1234567890 left 1234567890 right'

      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          {
            oldString: '1234567890',
            newString: 'BOUNDARY',
            allowMultiple: true,
          },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect(result).not.toBeNull()
      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toBe('BOUNDARY left BOUNDARY right')
      }
    })

    it('should replace a deterministic range with explicit line elision', async () => {
      const initialContent = [
        'function target() {',
        '  const keep = true',
        '  const value = 1',
        '  return value',
        '} // end target',
        '',
      ].join('\n')

      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          {
            oldString: ['function target() {', '...', '} // end target'].join(
              '\n',
            ),
            newString: 'function target() {\n  return 2\n} // end target',
            allowMultiple: false,
          },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect(result).not.toBeNull()
      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toBe(
          'function target() {\n  return 2\n} // end target\n',
        )
        expect(result.messages).toContain(
          'Matched explicit `...` elision in oldString at lines 1-5.',
        )
      }
    })

    it('should preserve exact-match precedence for literal ellipsis text', async () => {
      const initialContent = ['start literal', '...', 'end literal', ''].join(
        '\n',
      )

      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          {
            oldString: ['start literal', '...', 'end literal'].join('\n'),
            newString: 'literal ellipsis replaced',
            allowMultiple: false,
          },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect(result).not.toBeNull()
      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toBe('literal ellipsis replaced\n')
        expect(result.messages).not.toContain(
          'Matched explicit `...` elision in oldString at lines 1-3.',
        )
      }
    })

    it('should reject ambiguous explicit line elision', async () => {
      const initialContent = [
        'function target() {',
        '  return 1',
        '} // end target',
        'function target() {',
        '  return 2',
        '} // end target',
      ].join('\n')

      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          {
            oldString: ['function target() {', '...', '} // end target'].join(
              '\n',
            ),
            newString: 'function target() {\n  return 3\n} // end target',
            allowMultiple: false,
          },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect(result).not.toBeNull()
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('Elided oldString is ambiguous')
        expect(result.error).toContain('does not support allowMultiple')
      }
    })

    it('should reject allowMultiple with deterministic explicit line elision', async () => {
      const initialContent = [
        'function target() {',
        '  const keep = true',
        '  return 1',
        '} // end target',
      ].join('\n')

      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          {
            oldString: ['function target() {', '...', '} // end target'].join(
              '\n',
            ),
            newString: 'function target() {\n  return 2\n} // end target',
            allowMultiple: true,
          },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect(result).not.toBeNull()
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('does not support allowMultiple')
        expect(result.error).toContain('Set allowMultiple to false')
      }
    })

    it('should treat inline ellipsis as literal text, not an elision marker', async () => {
      const initialContent = [
        'start literal',
        'middle literal',
        'end literal',
      ].join('\n')

      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          {
            oldString: 'start literal ... end literal',
            newString: 'inline ellipsis replaced',
            allowMultiple: false,
          },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect(result).not.toBeNull()
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('The old string')
        expect(result.error).not.toContain('Elided oldString')
        expect(result.error).not.toContain('Invalid elided oldString')
      }
    })

    it('should reject elision markers with tiny literal anchors', async () => {
      const initialContent = ['a', 'middle', 'b'].join('\n')

      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          {
            oldString: ['a', '...', 'b'].join('\n'),
            newString: 'tiny',
            allowMultiple: false,
          },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect(result).not.toBeNull()
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('each literal anchor segment')
        expect(result.error).toContain('at least 10 non-whitespace characters')
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

  it('should auto-correct a safe single-winner near match', async () => {
    const initialContent = [
      'export function calculateTotal(items: Item[]) {',
      '  const subtotal = items.reduce((sum, item) => sum + item.price, 0)',
      '  return subtotal',
      '}',
    ].join('\n')
    const oldStr = [
      'export function calculateTotal(items: Item[]) {',
      '  const subTotal = items.reduce((sum, item) => sum + item.price, 0)',
      '  return subtotal',
      '}',
    ].join('\n')
    const newStr = [
      'export function calculateTotal(items: Item[]) {',
      '  const subtotal = items.reduce((sum, item) => sum + item.price, 0)',
      '  return subtotal * 1.0825',
      '}',
    ].join('\n')

    const result = await processStrReplace({
      path: 'test.ts',
      replacements: [
        { oldString: oldStr, newString: newStr, allowMultiple: false },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toBe(newStr)
      expect(
        result.messages.some((msg) =>
          msg.includes('auto-corrected a near-match edit'),
        ),
      ).toBe(true)
    }
  })

  it('should refuse auto-correction when oldStr is a strict subset of a wider matching region', async () => {
    // Regression test for the "edit breaks files for no reason" failure mode:
    // a 10-line oldStr that matches the bottom 10 lines of an 11-line JSDoc'd
    // block used to auto-correct against the narrower 10-line slice and
    // silently orphan the `/**` opener. The subset-safety check in
    // tryNearMatchAutoCorrect must now refuse this and surface a normal
    // "Edit blocked" recovery error instead.
    const initialContent = [
      '/**',
      ' * Subtract two numbers.',
      ' * @param a first number',
      ' * @param b second number',
      ' * @returns a - b',
      ' */',
      'export function subtract(a: number, b: number) {',
      '  return a - b',
      '}',
      '',
      'export const VERSION = "1.0"',
    ].join('\n')

    // 10-line oldStr: missing the `/**` opener AND has one trailing-version
    // diff ("1.0.0" vs "1.0") so it does not exactly match anywhere in the
    // file. The 10-line slice at lines 2-11 of the file has similarity ~0.99;
    // the wider 11-line slice at lines 1-11 has similarity ~0.97 (extra
    // `/**` line + the trailing-version diff). Both are above
    // NEAR_MATCH_MIN_SIMILARITY (0.92), so subset-safety must fire.
    const oldStr = [
      ' * Subtract two numbers.',
      ' * @param a first number',
      ' * @param b second number',
      ' * @returns a - b',
      ' */',
      'export function subtract(a: number, b: number) {',
      '  return a - b',
      '}',
      '',
      'export const VERSION = "1.0.0"',
    ].join('\n')
    const newStr = oldStr.replace('"1.0.0"', '"2.0.0"')

    const result = await processStrReplace({
      path: 'test.ts',
      replacements: [
        { oldString: oldStr, newString: newStr, allowMultiple: false },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    // Subset-safety must refuse: the 10-line chosen block is a strict
    // subset of the wider 11-line block at the same location. Expect an
    // error result (no auto-corrected content) so the model re-reads the
    // file rather than orphaning the `/**` opener.
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('The old string')
      expect(result.error).toContain('target block was already changed/removed')
    }
  })

  it('corrects a single stray character before a uniquely matched JSDoc line', async () => {
    const initialContent = [
      '/**',
      ' * non-trademark types after submission. Reusing it for downloads avoids',
      ' * duplicating the package formatting logic.',
      ' */',
      '',
      'export function buildApplicationPackage(',
      '  value: string,',
      ') {',
      '  return value',
      '}',
    ].join('\n')
    const oldString = [
      ' * non-trademark types after submission. Reusing it for downloads avoids',
      'n * duplicating the package formatting logic.',
      ' */',
      '',
      'export function buildApplicationPackage(',
    ].join('\n')
    const newString = [
      ' * non-trademark types after submission. Reusing it for downloads avoids',
      ' * duplicating the package formatting logic.',
      ' */',
      '',
      'export function buildDownloadPackage(',
    ].join('\n')

    const result = await processStrReplace({
      path: 'server/src/services/ip.ts',
      replacements: [{ oldString, newString, allowMultiple: false }],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toContain('export function buildDownloadPackage(')
      expect(result.content).not.toContain('\nn * duplicating')
      expect(result.messages).toContain(
        'Matched after removing one stray character before a uniquely identifiable block-comment line.',
      )
    }
  })

  it('should refuse to auto-correct a stale oldString at sub-0.92 similarity even with a single candidate and no runner-up (Fix A)', async () => {
    // Regression test for Fix A: the adaptive 0.80 near-match branch was
    // removed. A stale oldString that is ~0.84 similar to a single candidate
    // (no distinct runner-up) used to auto-correct under the old 0.80 path with
    // no margin check. It must now fall through to the rich diagnostic error so
    // the model re-reads instead of guessing, mirroring the subset-safety test
    // above.
    const initialContent = [
      'export function processRefund(order: Order) {',
      '  const amount = order.totalCents',
      '  const reason = order.refundReason',
      '  return issueRefund(amount, reason)',
      '}',
    ].join('\n')
    // Stale oldString: several small diffs (renamed identifiers, dropped line)
    // put similarity well below 0.92 but above 0.80, with exactly one candidate.
    const oldStr = [
      'export function processRefund(order: Order) {',
      '  const amount = order.totalAmount',
      '  const reason = order.returnReason',
      '  return issueRefund(amount)',
      '}',
    ].join('\n')
    const newStr = [
      'export function processRefund(order: Order) {',
      '  const amount = order.totalCents',
      '  const reason = order.refundReason',
      '  return issueRefund(amount, reason, true)',
      '}',
    ].join('\n')

    const result = await processStrReplace({
      path: 'test.ts',
      replacements: [
        { oldString: oldStr, newString: newStr, allowMultiple: false },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('The old string')
      expect(
        result.error.includes('Closest candidate ranges') ||
          result.error.includes('target block was already changed/removed'),
      ).toBe(true)
    }
  })

  it('should reject a near-match auto-correction that would leave unbalanced brackets (Fix B)', async () => {
    // Regression test for Fix B (isResultDelimiterBalanced): a near-match that
    // meets the 0.92 threshold must still be rejected when the newStr drops a
    // closing brace (net bracket delta != 0). The file has a balanced
    // switch/case structure; the oldString is a near-match to one case body,
    // and the newString removes the case's closing `}`.
    const initialContent = [
      'switch (status) {',
      '  case "open": {',
      '    handleOpen(record)',
      '    break',
      '  }',
      '  case "closed": {',
      '    handleClosed(record)',
      '    break',
      '  }',
      '}',
    ].join('\n')
    // Near-match to the `case "closed"` body: one identifier drift keeps it
    // below an exact match but above 0.92 similarity, single candidate.
    const oldStr = [
      '  case "closed": {',
      '    handleClose(record)',
      '    break',
      '  }',
    ].join('\n')
    // newStr drops the closing `}`: net `{` delta goes from +1/-1 (balanced)
    // to +1/-0 (unbalanced), so isResultDelimiterBalanced must reject it.
    const newStr = [
      '  case "closed": {',
      '    handleClosed(record)',
      '    break',
    ].join('\n')

    const result = await processStrReplace({
      path: 'test.ts',
      replacements: [
        { oldString: oldStr, newString: newStr, allowMultiple: false },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('The old string')
      // The delimiter-balance check makes tryNearMatchAutoCorrect return null,
      // so the rich diagnostic error (with candidate ranges) is emitted.
      expect(result.error).toContain('Closest candidate ranges')
    }
  })

  it('should not auto-correct a short oldString below the autocorrect min length (Fix E)', async () => {
    // Regression test for Fix E: NEAR_MATCH_AUTOCORRECT_MIN_OLD_STR_LENGTH is
    // 30 in source. A short oldString (< 30 chars after trim) that misses an
    // exact match must NOT be auto-corrected even if a single high-similarity
    // candidate exists, because short strings too easily match the wrong spot.
    // It must instead return an error.
    const initialContent = ['const alphaValue = 1', 'const betaValue = 2'].join(
      '\n',
    )
    // 24 chars after trim — below the 30-char autocorrect threshold.
    const oldStr = 'const alphaValu = 1'
    const newStr = 'const alphaValue = 10'

    const result = await processStrReplace({
      path: 'test.ts',
      replacements: [
        { oldString: oldStr, newString: newStr, allowMultiple: false },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('The old string')
    }
  })

  it('should fail safely when near matches are ambiguous', async () => {
    const initialContent = [
      'export function loadUtilityConfig() {',
      '  const timeoutMs = readConfigNumber("timeoutMs", 5_000)',
      '  return timeoutMs',
      '}',
      '',
      'export function loadUtilityConfigTest() {',
      '  const timeoutMs = readConfigNumber("timeoutMS", 5_000)',
      '  return timeoutMs',
      '}',
    ].join('\n')
    const oldStr = [
      'export function loadUtilityConfig() {',
      '  const timeoutMs = readConfigNumber("timeoutMX", 5_000)',
      '  return timeoutMs',
      '}',
    ].join('\n')

    const result = await processStrReplace({
      path: 'test.ts',
      replacements: [
        {
          oldString: oldStr,
          newString: oldStr.replace('5_000', '10_000'),
          allowMultiple: false,
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('The old string')
      expect(result.error).toContain('Closest candidate ranges')
      expect(result.error).toContain('loadUtilityConfig')
      expect(result.error).toContain('loadUtilityConfigTest')
    }
  })

  it('should suppress low-similarity fuzzy candidates and give stale-read guidance', async () => {
    const initialContent =
      'const firstVar = 1;\nconst secondVar = 2;\nconst thirdVar = 3;\n'
    const oldStr = 'const completelyDifferentValue = 200;'
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
      expect(result.error).toContain(
        'The old string "const completelyDifferentValue = 200;" was not found',
      )
      expect(result.error).toContain('target block was already changed/removed')
      expect(result.error).toContain('No useful candidate ranges found')
      expect(result.error).toContain('re-read the current file/range')
      expect(result.error).not.toContain('Candidate 1: lines')
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
      expect(result.error).toContain(
        'Closest candidate ranges for read_files.ranges recovery:',
      )
      expect(result.error).toContain('Candidate 1: lines')
      expect(result.error).toContain('Candidate 2: lines')
      expect(result.error).toContain('targetAlpha')
    }
  })

  it('should apply naked str_replace on large files when oldString is unique', async () => {
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
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toContain('const target = 2;')
      expect(result.content).not.toContain('const target = 1;')
      expect(
        result.messages.some((msg) =>
          msg.includes('deterministic oldString match'),
        ),
      ).toBe(true)
    }
  })

  it('should block naked str_replace on large files when oldString is ambiguous', async () => {
    const initialContent = Array.from({ length: 1_001 }, (_, index) =>
      index === 300 || index === 700
        ? 'const target = 1;'
        : `const filler${index} = ${index};`,
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
      expect(result.error).toContain('oldString was not uniquely identifiable')
    }
  })

  it('should allow large-file str_replace when basedOnRead is a readCapability token', async () => {
    const lines = Array.from({ length: 1_001 }, (_, index) =>
      index === 500 ? 'const target = 1;' : `const filler${index} = ${index};`,
    )
    const initialContent = lines.join('\n')
    const rangeContent = lines.slice(500, 501).join('\n')
    const token = encodeReadCapabilityToken({
      startLine: 501,
      endLine: 501,
      hash: getContentHash(rangeContent),
    })

    const result = await processStrReplace({
      path: 'large.ts',
      replacements: [
        {
          oldString: 'const target = 1;',
          newString: 'const target = 2;',
          allowMultiple: false,
          basedOnRead: token,
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

  it('should ignore a stale readCapability token on large files when oldString is unique', async () => {
    const lines = Array.from({ length: 1_001 }, (_, index) =>
      index === 500 ? 'const target = 1;' : `const filler${index} = ${index};`,
    )
    const initialContent = lines.join('\n')
    const staleToken = encodeReadCapabilityToken({
      startLine: 501,
      endLine: 501,
      hash: getContentHash('const target = 0;'),
    })

    const result = await processStrReplace({
      path: 'large.ts',
      replacements: [
        {
          oldString: 'const target = 1;',
          newString: 'const target = 2;',
          allowMultiple: false,
          basedOnRead: staleToken,
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toContain('const target = 2;')
      expect(result.content).not.toContain('const target = 1;')
      expect(
        result.messages.some((msg) =>
          msg.includes('ignoring a stale basedOnRead anchor'),
        ),
      ).toBe(true)
    }
  })

  it('should block a stale readCapability token on large files when oldString is ambiguous', async () => {
    const lines = Array.from({ length: 1_001 }, (_, index) =>
      index === 300 || index === 700
        ? 'const target = 1;'
        : `const filler${index} = ${index};`,
    )
    const initialContent = lines.join('\n')
    const staleToken = encodeReadCapabilityToken({
      startLine: 301,
      endLine: 301,
      hash: getContentHash('const target = 0;'),
    })

    const result = await processStrReplace({
      path: 'large.ts',
      replacements: [
        {
          oldString: 'const target = 1;',
          newString: 'const target = 2;',
          allowMultiple: false,
          basedOnRead: staleToken,
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('Large-file edit blocked for large.ts')
      expect(result.error).toContain('basedOnRead anchor was stale')
    }
  })

  it('should emit a fresh capability token for the current range content when rejecting a stale basedOnRead anchor (Gap #3)', async () => {
    // When the hash mismatches, the agent should be told BOTH that the anchor is
    // stale AND given a ready-to-use fresh token for the current content of the
    // same line range, so after re-reading oldString it can retry without
    // hand-deriving a new hash.
    const lines = Array.from({ length: 1_001 }, (_, index) =>
      index === 300 || index === 700
        ? 'const target = 1;'
        : `const filler${index} = ${index};`,
    )
    const initialContent = lines.join('\n')
    const staleToken = encodeReadCapabilityToken({
      startLine: 301,
      endLine: 301,
      hash: getContentHash('const target = 0;'),
    })

    const result = await processStrReplace({
      path: 'large.ts',
      replacements: [
        {
          oldString: 'const target = 1;',
          newString: 'const target = 2;',
          allowMultiple: false,
          basedOnRead: staleToken,
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      // The fresh-token hint points at the CURRENT content of the same line range.
      const expectedFreshHash = getContentHash(lines[300])
      expect(result.error).toContain('readCapability=cap.')
      expect(result.error).toContain(
        'Fresh capability token for the CURRENT content of lines 301-301',
      )
      // The emitted token decodes to the current content hash, not the stale one.
      expect(result.error).toContain(expectedFreshHash)
    }
  })

  it('should reject a malformed readCapability token on large files when oldString is ambiguous', async () => {
    // oldString appears twice, so the malformed anchor cannot be auto-stripped
    // (the loop-breaker only strips when oldString is uniquely matchable).
    const initialContent = Array.from({ length: 1_001 }, (_, index) =>
      index === 300 || index === 700
        ? 'const target = 1;'
        : `const filler${index} = ${index};`,
    ).join('\n')

    const result = await processStrReplace({
      path: 'large.ts',
      replacements: [
        {
          oldString: 'const target = 1;',
          newString: 'const target = 2;',
          allowMultiple: false,
          basedOnRead: 'not-a-valid-token',
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('Invalid basedOnRead')
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

  it('should abort an entire large-file batch when one replacement fails', async () => {
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
          oldString: 'const missing = 1;',
          newString: 'const missing = 2;',
          allowMultiple: false,
          basedOnRead,
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('Atomic str_replace batch aborted')
      expect(result.error).toContain('NO changes were made')
      expect(result.error).toContain('Replacement 2/2 failed:')
      expect(result.error).toContain('const missing = 1;')
      expect(result.error).toContain('already changed/removed')
      expect(result.error).toContain('consider replace_range with expectedHash')
      expect(result.error).not.toContain('+const first = 2;')
    }
  })

  it('should allow line-count-changing basedOnRead replacements', async () => {
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
          oldString: 'const first = 1;\nconst second = 1;',
          newString:
            'const first = 2;\nconst inserted = true;\nconst second = 2;',
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
      expect(result.content).toContain(
        'const first = 2;\nconst inserted = true;\nconst second = 2;',
      )
    }
  })

  it('keeps later anchored large-file edits aligned after earlier line insertions', async () => {
    const lines = Array.from({ length: 1_001 }, (_, index) =>
      index === 100
        ? 'const first = 1;'
        : index === 500
          ? 'const second = 1;'
          : `const filler${index} = ${index};`,
    )
    const initialContent = lines.join('\n')
    const firstRange = lines.slice(100, 101).join('\n')
    const secondRange = lines.slice(500, 501).join('\n')

    const result = await processStrReplace({
      path: 'large.ts',
      replacements: [
        {
          oldString: 'const first = 1;',
          newString: 'const first = 2;\nconst inserted = true;',
          allowMultiple: false,
          basedOnRead: {
            startLine: 101,
            endLine: 101,
            hash: getContentHash(firstRange),
          },
        },
        {
          oldString: 'const second = 1;',
          newString: 'const second = 2;',
          allowMultiple: false,
          basedOnRead: {
            startLine: 501,
            endLine: 501,
            hash: getContentHash(secondRange),
          },
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('content' in result).toBe(true)
    if ('content' in result) {
      const resultLines = result.content.split('\n')
      expect(resultLines[100]).toBe('const first = 2;')
      expect(resultLines[101]).toBe('const inserted = true;')
      expect(resultLines[501]).toBe('const second = 2;')
    }
  })

  it('expands the same validated range after line insertions inside it', async () => {
    const lines = Array.from({ length: 1_001 }, (_, index) =>
      index === 500
        ? 'const first = 1;\nconst middle = 1;\nconst last = 1;'
        : `const filler${index} = ${index};`,
    )
    const initialContent = lines.join('\n')
    const rangeContent = lines.slice(500, 501).join('\n')
    const basedOnRead = {
      startLine: 501,
      endLine: 503,
      hash: getContentHash(rangeContent),
    }

    const result = await processStrReplace({
      path: 'large.ts',
      replacements: [
        {
          oldString: 'const first = 1;',
          newString: 'const first = 2;\nconst inserted = true;',
          allowMultiple: false,
          basedOnRead,
        },
        {
          oldString: 'const last = 1;',
          newString: 'const last = 2;',
          allowMultiple: false,
          basedOnRead,
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toContain(
        'const first = 2;\nconst inserted = true;\nconst middle = 1;\nconst last = 2;',
      )
    }
  })

  it('keeps later anchored ranges aligned after allowMultiple line insertions', async () => {
    const lines = Array.from({ length: 1_001 }, (_, index) =>
      index === 100
        ? 'const repeated = 1;'
        : index === 300
          ? 'const target = 1;'
          : index === 500
            ? 'const repeated = 1;'
            : `const filler${index} = ${index};`,
    )
    const initialContent = lines.join('\n')
    const repeatedRange = lines.slice(100, 501).join('\n')
    const targetRange = lines.slice(300, 301).join('\n')

    const result = await processStrReplace({
      path: 'large.ts',
      replacements: [
        {
          oldString: 'const repeated = 1;',
          newString: 'const repeated = 2;\nconst inserted = true;',
          allowMultiple: true,
          basedOnRead: {
            startLine: 101,
            endLine: 501,
            hash: getContentHash(repeatedRange),
          },
        },
        {
          oldString: 'const target = 1;',
          newString: 'const target = 2;',
          allowMultiple: false,
          basedOnRead: {
            startLine: 301,
            endLine: 301,
            hash: getContentHash(targetRange),
          },
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('content' in result).toBe(true)
    if ('content' in result) {
      const resultLines = result.content.split('\n')
      expect(resultLines[100]).toBe('const repeated = 2;')
      expect(resultLines[101]).toBe('const inserted = true;')
      expect(resultLines[301]).toBe('const target = 2;')
      expect(resultLines[501]).toBe('const repeated = 2;')
      expect(resultLines[502]).toBe('const inserted = true;')
    }
  })

  it('[ABI-M07] scopes deletion-only skipIfMissing checks to the anchored range', async () => {
    const lines = Array.from({ length: 1_001 }, (_, index) =>
      index === 100
        ? 'console.log("debug")'
        : index === 500
          ? 'const target = 1;'
          : `const filler${index} = ${index};`,
    )
    const initialContent = lines.join('\n')
    const targetRange = lines.slice(500, 501).join('\n')

    const result = await processStrReplace({
      path: 'large.ts',
      replacements: [
        {
          oldString: 'console.log("debug")',
          newString: '',
          allowMultiple: false,
          skipIfMissing: true,
          basedOnRead: {
            startLine: 501,
            endLine: 501,
            hash: getContentHash(targetRange),
          },
        },
        {
          oldString: 'const target = 1;',
          newString: 'const target = 2;',
          allowMultiple: false,
          basedOnRead: {
            startLine: 501,
            endLine: 501,
            hash: getContentHash(targetRange),
          },
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toContain('console.log("debug")')
      expect(result.content).toContain('const target = 2;')
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
      expect(result.content).toContain(
        'const target = 2;\r\nconst neighbor = 1;',
      )
      expect(result.content).toContain('\r\n')
    }
  })

  it('validates object-form basedOnRead even on small files', async () => {
    const result = await processStrReplace({
      path: 'small.ts',
      replacements: [
        {
          oldString: 'const x = 1;',
          newString: 'const x = 2;',
          allowMultiple: false,
          basedOnRead: {
            startLine: 0,
            endLine: 1,
            hash: getContentHash('const x = 1;'),
          },
        },
      ],
      initialContentPromise: Promise.resolve('const x = 1;\n'),
      logger,
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('Invalid basedOnRead')
      expect(result.error).toContain('positive finite integer')
    }
  })

  it('validates occurrenceIndex at runtime', async () => {
    const result = await processStrReplace({
      path: 'small.ts',
      replacements: [
        {
          oldString: 'const x = 1;',
          newString: 'const x = 2;',
          allowMultiple: false,
          occurrenceIndex: 0,
        },
      ],
      initialContentPromise: Promise.resolve('const x = 1;\n'),
      logger,
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('Invalid occurrenceIndex')
      expect(result.error).toContain('positive finite integer')
    }
  })

  it('should ignore stale basedOnRead hashes on large files when oldString is unique', async () => {
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

    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toContain('const target = 2;')
      expect(result.content).not.toContain('const target = 1;')
      expect(
        result.messages.some((msg) =>
          msg.includes('ignoring a stale basedOnRead anchor'),
        ),
      ).toBe(true)
    }
  })

  it('should ignore stale basedOnRead on small files and still apply the edit', async () => {
    const initialContent = 'const x = 1;\nconst y = 2;\n'

    const result = await processStrReplace({
      path: 'small.ts',
      replacements: [
        {
          oldString: 'const y = 2;',
          newString: 'const y = 3;',
          allowMultiple: false,
          basedOnRead: {
            startLine: 1,
            endLine: 1,
            hash: getContentHash('totally stale content'),
          },
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toBe('const x = 1;\nconst y = 3;\n')
      expect(
        result.messages.some((msg) =>
          msg.includes('basedOnRead was ignored for small.ts'),
        ),
      ).toBe(true)
    }
  })

  it('should ignore basedOnRead bounds on small files (whole-file match still works)', async () => {
    const initialContent = 'alpha\nbeta\ngamma\n'

    const result = await processStrReplace({
      path: 'small.ts',
      replacements: [
        {
          oldString: 'gamma',
          newString: 'delta',
          allowMultiple: false,
          // Bounds point at a different region than where the match lives; on a
          // small file these bounds must not restrict matching.
          basedOnRead: {
            startLine: 1,
            endLine: 1,
            hash: getContentHash('alpha'),
          },
        },
      ],
      initialContentPromise: Promise.resolve(initialContent),
      logger,
    })

    expect('content' in result).toBe(true)
    if ('content' in result) {
      expect(result.content).toBe('alpha\nbeta\ndelta\n')
    }
  })

  describe('bogus basedOnRead rejection', () => {
    // Anchored on an AMBIGUOUS oldString (two identical occurrences) so the
    // bogus anchor cannot be auto-stripped: this is the case that must still
    // hard-fail. When oldString is unique, the anchor is auto-stripped instead
    // (covered by the 'bogus basedOnRead auto-strip' suite below).
    const ambiguousContent = 'const y = 2;\nconst y = 2;\n'

    it('rejects a placeholder "dummy" anchor when oldString is ambiguous', async () => {
      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          {
            oldString: 'const y = 2;',
            newString: 'const y = 3;',
            allowMultiple: false,
            basedOnRead: 'dummy' as any,
          },
        ],
        initialContentPromise: Promise.resolve(ambiguousContent),
        logger,
      })

      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('placeholder')
        expect(result.error).toContain(recoveryGuidance)
      }
    })

    it('rejects other stub anchors regardless of case when oldString is ambiguous', async () => {
      for (const stub of ['TODO', 'cap.DUMMY', 'placeholder', 'undefined']) {
        const result = await processStrReplace({
          path: 'test.ts',
          replacements: [
            {
              oldString: 'const y = 2;',
              newString: 'const y = 3;',
              allowMultiple: false,
              basedOnRead: stub as any,
            },
          ],
          initialContentPromise: Promise.resolve(ambiguousContent),
          logger,
        })
        expect('error' in result).toBe(true)
      }
    })

    it('rejects a malformed (non-cap) string anchor when oldString is ambiguous', async () => {
      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          {
            oldString: 'const y = 2;',
            newString: 'const y = 3;',
            allowMultiple: false,
            basedOnRead: 'not-a-real-token' as any,
          },
        ],
        initialContentPromise: Promise.resolve(ambiguousContent),
        logger,
      })

      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('basedOnRead')
        expect(result.error).toContain(
          'Do NOT resubmit the same basedOnRead literal',
        )
      }
    })

    it('still accepts a valid cap token anchor on small files', async () => {
      const initialContent = 'const x = 1;\nconst y = 2;\n'
      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          {
            oldString: 'const y = 2;',
            newString: 'const y = 3;',
            allowMultiple: false,
            basedOnRead: encodeReadCapabilityToken({
              startLine: 1,
              endLine: 2,
              hash: getContentHash(initialContent),
            }),
          },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toBe('const x = 1;\nconst y = 3;\n')
      }
    })
  })

  describe('bogus basedOnRead auto-strip (loop-breaker)', () => {
    // Regression: a model that loops by re-reading then resubmitting the SAME
    // invalid anchor (e.g. basedOnRead: "/placeholder") must not be stuck. When
    // the oldString is uniquely matchable the anchor is unnecessary, so it is
    // auto-stripped and the edit applies as a naked edit with a warning.
    it('auto-strips a path-like invalid anchor when oldString is unique (small file)', async () => {
      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          {
            oldString: 'const y = 2;',
            newString: 'const y = 3;',
            allowMultiple: false,
            basedOnRead: '/placeholder' as any,
          },
        ],
        initialContentPromise: Promise.resolve('const x = 1;\nconst y = 2;\n'),
        logger,
      })

      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toBe('const x = 1;\nconst y = 3;\n')
        expect(
          result.messages.some((msg) =>
            msg.includes('an invalid basedOnRead anchor was ignored'),
          ),
        ).toBe(true)
      }
    })

    it('auto-strips a stub anchor when oldString is unique', async () => {
      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          {
            oldString: 'const y = 2;',
            newString: 'const y = 3;',
            allowMultiple: false,
            basedOnRead: 'dummy' as any,
          },
        ],
        initialContentPromise: Promise.resolve('const x = 1;\nconst y = 2;\n'),
        logger,
      })

      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toBe('const x = 1;\nconst y = 3;\n')
      }
    })

    it('uses strict-specific guidance when a unique oldString has an invalid required capability', async () => {
      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          {
            oldString: 'const y = 2;',
            newString: 'const y = 3;',
            allowMultiple: false,
            basedOnRead: 'dummy' as any,
          },
        ],
        requireFreshReadCapability: true,
        initialContentPromise: Promise.resolve('const x = 1;\nconst y = 2;\n'),
        logger,
      })

      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain(
          'Strict read-before-edit requires a valid fresh basedOnRead capability',
        )
        expect(result.error).not.toContain(
          'oldString is not uniquely matchable',
        )
      }
    })

    it('auto-strips an invalid anchor on a large file when oldString is unique', async () => {
      const lines = Array.from({ length: 1_001 }, (_, index) =>
        index === 500
          ? 'const target = 1;'
          : `const filler${index} = ${index};`,
      )
      const result = await processStrReplace({
        path: 'large.ts',
        replacements: [
          {
            oldString: 'const target = 1;',
            newString: 'const target = 2;',
            allowMultiple: false,
            basedOnRead: '/placeholder' as any,
          },
        ],
        initialContentPromise: Promise.resolve(lines.join('\n')),
        logger,
      })

      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toContain('const target = 2;')
        expect(result.content).not.toContain('const target = 1;')
      }
    })

    it('does NOT auto-strip when oldString is ambiguous and gives loop-stopping guidance', async () => {
      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          {
            oldString: 'const y = 2;',
            newString: 'const y = 3;',
            allowMultiple: false,
            basedOnRead: '/placeholder' as any,
          },
        ],
        initialContentPromise: Promise.resolve('const y = 2;\nconst y = 2;\n'),
        logger,
      })

      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain(
          'Do NOT resubmit the same basedOnRead literal',
        )
        expect(result.error).toContain(recoveryGuidance)
      }
    })
  })

  describe('echoed fresh anchors on write (large files)', () => {
    it('echoes a reusable regionAnchor readCapability after a large-file edit', async () => {
      const lines = Array.from({ length: 1_001 }, (_, index) =>
        index === 500
          ? 'const target = 1;'
          : `const filler${index} = ${index};`,
      )
      const initialContent = lines.join('\n')

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

      expect('content' in result).toBe(true)
      if (!('content' in result)) return

      const anchorMessage = result.messages.find((msg) =>
        msg.includes('readCapability='),
      )
      expect(anchorMessage).toBeDefined()

      // The echoed token must validate against the POST-edit content exactly as
      // a freshly-read anchor would: a second edit using it must apply.
      const tokenMatch = anchorMessage!.match(
        /readCapability=(cap\.[A-Za-z0-9_-]+)/,
      )
      expect(tokenMatch).not.toBeNull()
      const echoedToken = tokenMatch![1]

      const followUp = await processStrReplace({
        path: 'large.ts',
        replacements: [
          {
            oldString: 'const target = 2;',
            newString: 'const target = 3;',
            allowMultiple: false,
            basedOnRead: echoedToken,
          },
        ],
        initialContentPromise: Promise.resolve(result.content),
        logger,
      })

      expect('content' in followUp).toBe(true)
      if ('content' in followUp) {
        expect(followUp.content).toContain('const target = 3;')
        expect(followUp.content).not.toContain('const target = 2;')
      }
    })

    it('does not echo an anchor for small-file edits', async () => {
      const initialContent = 'const x = 1;\nconst y = 2;\n'
      const result = await processStrReplace({
        path: 'small.ts',
        replacements: [
          {
            oldString: 'const y = 2;',
            newString: 'const y = 3;',
            allowMultiple: false,
          },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(
          result.messages.some((msg) => msg.includes('readCapability=')),
        ).toBe(false)
      }
    })
  })

  describe('occurrenceIndex targeting', () => {
    it('lets occurrenceIndex target a tiny repeated anchor on a small file', async () => {
      const initialContent = 'foo\nbar\nfoo\nbaz\nfoo\n'
      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          {
            oldString: 'foo',
            newString: 'FOO',
            allowMultiple: false,
            occurrenceIndex: 2,
          },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect('content' in result).toBe(true)
      if ('content' in result) {
        expect(result.content).toBe('foo\nbar\nFOO\nbaz\nfoo\n')
      }
    })

    it('disambiguates repeated text on a large file without basedOnRead', async () => {
      const lines = Array.from({ length: 1_001 }, (_, index) =>
        index === 300 || index === 700
          ? 'const target = 1;'
          : `const filler${index} = ${index};`,
      )
      const initialContent = lines.join('\n')

      const result = await processStrReplace({
        path: 'large.ts',
        replacements: [
          {
            oldString: 'const target = 1;',
            newString: 'const target = 2;',
            allowMultiple: false,
            occurrenceIndex: 2,
          },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect('content' in result).toBe(true)
      if ('content' in result) {
        // Only the SECOND occurrence (line 701) is changed; the first remains.
        const out = result.content.split('\n')
        expect(out[300]).toBe('const target = 1;')
        expect(out[700]).toBe('const target = 2;')
      }
    })

    it('fails cleanly when occurrenceIndex exceeds the number of matches', async () => {
      const initialContent = 'foo\nbar\nfoo\n'
      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          {
            oldString: 'foo',
            newString: 'FOO',
            allowMultiple: false,
            occurrenceIndex: 5,
          },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('occurrenceIndex 5')
        expect(result.error).toContain('only 2 exact occurrence(s)')
      }
    })
  })

  describe('ambiguous oldString lists all candidate ranges', () => {
    it('reports every occurrence and suggests occurrenceIndex', async () => {
      const initialContent = Array.from({ length: 30 }, (_, index) =>
        index % 10 === 5 ? 'duplicate line' : `filler${index}`,
      ).join('\n')

      const result = await processStrReplace({
        path: 'test.ts',
        replacements: [
          {
            oldString: 'duplicate line',
            newString: 'changed',
            allowMultiple: false,
          },
        ],
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })

      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('Found 3 occurrences')
        expect(result.error).toContain('occurrenceIndex')
        // All three candidate occurrences are listed (not capped before 3).
        expect(result.error).toContain('Occurrence 1:')
        expect(result.error).toContain('Occurrence 2:')
        expect(result.error).toContain('Occurrence 3:')
      }
    })
  })
})
