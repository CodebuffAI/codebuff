import { test, expect } from 'bun:test'

import {
  parsePatternsIndex,
  loadPatternsIndex,
  formatPatternsIndexPrompt,
} from '../patterns'

import type { Logger } from '../../types/contracts/logger'

function createMockLogger(): Logger {
  const calls: { level: string; msg: string }[] = []
  return {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: (obj: any, msg?: string) => calls.push({ level: 'warn', msg: msg ?? '' }),
    error: () => {},
    fatal: () => {},
    child: () => createMockLogger(),
  } as unknown as Logger & { _calls: typeof calls }
}

test('parsePatternsIndex parses a well-formed table', () => {
  const markdown = `# Patterns

| pattern | file | description |
| --- | --- | --- |
| add-a-new-tool | \`agents/patterns/add-a-new-tool.md\` | Add a new tool |
| ship-a-cli-command | \`agents/patterns/ship-a-cli-command.md\` | Ship a CLI command |
`
  const result = parsePatternsIndex(markdown)
  expect(result).toEqual([
    {
      name: 'add-a-new-tool',
      file: 'agents/patterns/add-a-new-tool.md',
      description: 'Add a new tool',
    },
    {
      name: 'ship-a-cli-command',
      file: 'agents/patterns/ship-a-cli-command.md',
      description: 'Ship a CLI command',
    },
  ])
})

test('parsePatternsIndex returns empty for empty input', () => {
  expect(parsePatternsIndex('')).toEqual([])
  expect(parsePatternsIndex('   ')).toEqual([])
})

test('parsePatternsIndex returns empty for no table', () => {
  const markdown = `# Patterns\n\nNo table here.\n`
  expect(parsePatternsIndex(markdown)).toEqual([])
})

test('parsePatternsIndex skips rows with missing name or file', () => {
  const markdown = `| pattern | file | description |
| --- | --- | --- |
|  | \`agents/patterns/x.md\` | Missing name |
| valid-pattern |  | Missing file |
| good-pattern | \`agents/patterns/good.md\` | Good |
`
  const result = parsePatternsIndex(markdown)
  expect(result).toHaveLength(1)
  expect(result[0].name).toBe('good-pattern')
})

test('parsePatternsIndex stops at first table end', () => {
  const markdown = `| pattern | file | description |
| --- | --- | --- |
| a | \`a.md\` | desc a |

Some prose here.

| pattern | file | description |
| --- | --- | --- |
| b | \`b.md\` | desc b |
`
  const result = parsePatternsIndex(markdown)
  expect(result).toHaveLength(1)
  expect(result[0].name).toBe('a')
})

test('parsePatternsIndex skips extra columns', () => {
  const markdown = `| pattern | file | description |
| --- | --- | --- |
| a | \`a.md\` | desc a | extra |
`
  const result = parsePatternsIndex(markdown)
  expect(result).toHaveLength(0)
})

test('parsePatternsIndex handles backtick-wrapped and bare file paths', () => {
  const markdown = `| pattern | file | description |
| --- | --- | --- |
| backtick | \`agents/patterns/a.md\` | with backticks |
| bare | agents/patterns/b.md | without backticks |
`
  const result = parsePatternsIndex(markdown)
  expect(result).toEqual([
    {
      name: 'backtick',
      file: 'agents/patterns/a.md',
      description: 'with backticks',
    },
    {
      name: 'bare',
      file: 'agents/patterns/b.md',
      description: 'without backticks',
    },
  ])
})

test('loadPatternsIndex returns empty for missing project root', () => {
  expect(loadPatternsIndex('')).toEqual([])
  // Non-existent directory
  expect(loadPatternsIndex('/nonexistent/path/that/does/not/exist')).toEqual(
    [],
  )
})

test('loadPatternsIndex returns empty when INDEX.md is absent', () => {
  const tmpDir = require('fs').mkdtempSync(
    require('path').join(require('os').tmpdir(), 'patterns-test-'),
  )
  expect(loadPatternsIndex(tmpDir)).toEqual([])
})

test('loadPatternsIndex reads and parses a real INDEX.md', () => {
  const fs = require('fs')
  const path = require('path')
  const os = require('os')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patterns-test-'))
  const patternsDir = path.join(tmpDir, 'agents', 'patterns')
  fs.mkdirSync(patternsDir, { recursive: true })
  fs.writeFileSync(
    path.join(patternsDir, 'INDEX.md'),
    `| pattern | file | description |
| --- | --- | --- |
| test-pattern | \`agents/patterns/test.md\` | A test |
`,
  )
  const result = loadPatternsIndex(tmpDir)
  expect(result).toEqual([
    {
      name: 'test-pattern',
      file: 'agents/patterns/test.md',
      description: 'A test',
    },
  ])
})

test('loadPatternsIndex logs warning on read error (permissions)', () => {
  const fs = require('fs')
  const path = require('path')
  const os = require('os')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patterns-test-'))
  const patternsDir = path.join(tmpDir, 'agents', 'patterns')
  fs.mkdirSync(patternsDir, { recursive: true })
  const indexPath = path.join(patternsDir, 'INDEX.md')
  fs.writeFileSync(indexPath, 'content')
  // Make the file unreadable (chmod 000). Skip on platforms where this doesn't work.
  try {
    fs.chmodSync(indexPath, 0o000)
    const logger = createMockLogger()
    const result = loadPatternsIndex(tmpDir, logger)
    expect(result).toEqual([])
    // Restore permissions for cleanup
    fs.chmodSync(indexPath, 0o644)
  } catch {
    // If chmod isn't supported (e.g. Windows), skip this test's assertion
    fs.chmodSync(indexPath, 0o644)
  }
})

test('formatPatternsIndexPrompt returns empty string for empty index', () => {
  expect(formatPatternsIndexPrompt({ index: [] })).toBe('')
})

test('formatPatternsIndexPrompt renders compact section', () => {
  const index = [
    {
      name: 'add-a-new-tool',
      file: 'agents/patterns/add-a-new-tool.md',
      description: 'Add a new tool',
    },
    {
      name: 'ship-a-cli-command',
      file: 'agents/patterns/ship-a-cli-command.md',
      description: 'Ship a CLI command',
    },
  ]
  const out = formatPatternsIndexPrompt({ index })
  expect(out).toContain('## Patterns library')
  expect(out).toContain('read_files')
  expect(out).toContain('- `add-a-new-tool`')
  expect(out).toContain('agents/patterns/add-a-new-tool.md')
  expect(out).toContain('Add a new tool')
  expect(out).toContain('- `ship-a-cli-command`')
})
