import { describe, test, expect, mock } from 'bun:test'

import {
  formatRoutedKnowledgeSection,
  loadRouterTable,
  parseRouterTable,
  resolveRoutedKnowledgeFiles,
} from '../router'

import type { Logger } from '../../types/contracts/logger'

const createMockLogger = (): Logger => ({
  debug: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
})

describe('parseRouterTable', () => {
  test('parses a simple agent → files table', () => {
    const md = `| agent | knowledge_files |
| --- | --- |
| base2 | AGENTS.md, docs/architecture.md |
| base2-plan | AGENTS.md, docs/development.md |
`
    expect(parseRouterTable(md)).toEqual({
      base2: ['AGENTS.md', 'docs/architecture.md'],
      'base2-plan': ['AGENTS.md', 'docs/development.md'],
    })
  })

  test('returns {} for empty input', () => {
    expect(parseRouterTable('')).toEqual({})
    expect(parseRouterTable('   ')).toEqual({})
  })

  test('ignores prose outside the table', () => {
    const md = `# Heading

Some prose.

| agent | knowledge_files |
| --- | --- |
| base2 | AGENTS.md |

More prose.
`
    expect(parseRouterTable(md)).toEqual({ base2: ['AGENTS.md'] })
  })

  test('skips rows with whitespace in the agent id', () => {
    const md = `| agent | knowledge_files |
| --- | --- |
| base2 | AGENTS.md |
| has spaces | AGENTS.md |
`
    expect(parseRouterTable(md)).toEqual({ base2: ['AGENTS.md'] })
  })

  test('skips rows with the wrong number of columns', () => {
    const md = `| agent | knowledge_files |
| --- | --- |
| base2 | AGENTS.md, docs/x.md |
| base2-extra | AGENTS.md, docs/x.md | trailing-cell |
`
    // Rows with extra columns beyond `agent | knowledge_files` are dropped
    // as malformed; only the canonical 2-column row survives.
    expect(parseRouterTable(md)).toEqual({
      base2: ['AGENTS.md', 'docs/x.md'],
    })
  })

  test('accepts single-file 2-column rows', () => {
    const md = `| agent | knowledge_files |
| --- | --- |
| base2-only-one | only-one-cell |
`
    expect(parseRouterTable(md)).toEqual({
      'base2-only-one': ['only-one-cell'],
    })
  })

  test('handles CRLF line endings', () => {
    const md =
      '| agent | knowledge_files |\r\n| --- | --- |\r\n| base2 | AGENTS.md |\r\n'
    expect(parseRouterTable(md)).toEqual({ base2: ['AGENTS.md'] })
  })
})

describe('resolveRoutedKnowledgeFiles', () => {
  const knowledgeFiles: Record<string, string> = {
    'AGENTS.md': '# A',
    'knowledge.md': '# K',
    'docs/architecture.md': '# Arch',
    'docs/missing.md': '# X',
  }

  test('returns the routed files when the agent has an entry', () => {
    const result = resolveRoutedKnowledgeFiles({
      routerTable: { base2: ['AGENTS.md', 'docs/architecture.md'] },
      agentId: 'base2',
      knowledgeFiles,
    })
    expect(result).toEqual(['AGENTS.md', 'docs/architecture.md'])
  })

  test('drops routed files that are not in knowledgeFiles', () => {
    const result = resolveRoutedKnowledgeFiles({
      routerTable: { base2: ['AGENTS.md', 'docs/not-here.md'] },
      agentId: 'base2',
      knowledgeFiles,
    })
    expect(result).toEqual(['AGENTS.md'])
  })

  test('falls back to all root knowledge files when router is empty', () => {
    const result = resolveRoutedKnowledgeFiles({
      routerTable: {},
      agentId: 'base2',
      knowledgeFiles,
    })
    expect(result.sort()).toEqual(['AGENTS.md', 'knowledge.md'].sort())
  })

  test('falls back when the agent has no router entry', () => {
    const result = resolveRoutedKnowledgeFiles({
      routerTable: { other: ['AGENTS.md'] },
      agentId: 'base2',
      knowledgeFiles,
    })
    expect(result.sort()).toEqual(['AGENTS.md', 'knowledge.md'].sort())
  })

  test('falls back to root knowledge files when agentId is undefined and router is empty', () => {
    expect(
      resolveRoutedKnowledgeFiles({
        routerTable: {},
        agentId: undefined,
        knowledgeFiles,
      }).sort(),
    ).toEqual(['AGENTS.md', 'knowledge.md'].sort())
  })
})

describe('formatRoutedKnowledgeSection', () => {
  test('renders matched files in the canonical block format', () => {
    const out = formatRoutedKnowledgeSection({
      files: ['AGENTS.md', 'docs/architecture.md'],
      knowledgeFiles: {
        'AGENTS.md': '# A',
        'docs/architecture.md': '# Arch',
      },
    })
    expect(out).toContain('```AGENTS.md\n# A\n```')
    expect(out).toContain('```docs/architecture.md\n# Arch\n```')
    expect(out.indexOf('AGENTS.md')).toBeLessThan(
      out.indexOf('docs/architecture.md'),
    )
  })

  test('returns empty string when no files', () => {
    expect(
      formatRoutedKnowledgeSection({ files: [], knowledgeFiles: {} }),
    ).toBe('')
  })

  test('skips files with no content', () => {
    const out = formatRoutedKnowledgeSection({
      files: ['AGENTS.md', 'missing.md'],
      knowledgeFiles: { 'AGENTS.md': '# A' },
    })
    expect(out).toBe('```AGENTS.md\n# A\n```')
  })
})

describe('loadRouterTable', () => {
  test('returns {} when projectRoot is falsy', () => {
    expect(loadRouterTable('', createMockLogger())).toEqual({})
    // @ts-expect-error testing defensive guard
    expect(loadRouterTable(undefined, createMockLogger())).toEqual({})
  })
})
