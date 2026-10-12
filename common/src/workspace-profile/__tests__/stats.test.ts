import { describe, expect, test } from 'bun:test'

import {
  WORKSPACE_STATS_MAX_LANGUAGES,
  buildStoredWorkspaceProfile,
  computeWorkspaceStats,
  countLines,
  isTestPath,
  languageForPath,
  shouldCountLines,
  workspaceStatsSchema,
} from '../stats'

describe('countLines', () => {
  test('counts a final line with or without a newline', () => {
    expect(countLines('')).toBe(0)
    expect(countLines('a')).toBe(1)
    expect(countLines('a\n')).toBe(1)
    expect(countLines('a\nb')).toBe(2)
    expect(countLines('a\nb\n')).toBe(2)
    expect(countLines('\n\n')).toBe(2)
    expect(countLines('a\r\nb\r\n')).toBe(2)
  })
})

describe('languageForPath', () => {
  test('maps extensions and well-known file names', () => {
    expect(languageForPath('src/app.tsx')?.name).toBe('TypeScript')
    expect(languageForPath('C:\\proj\\main.PY')?.name).toBe('Python')
    expect(languageForPath('Dockerfile')?.name).toBe('Dockerfile')
    expect(languageForPath('deploy/Dockerfile.prod')?.name).toBe('Dockerfile')
    expect(languageForPath('Gemfile')?.name).toBe('Ruby')
    expect(languageForPath('README.md')).toEqual({
      name: 'Markdown',
      kind: 'prose',
    })
    expect(languageForPath('styles.css')?.kind).toBe('markup')
    expect(languageForPath('package.json')?.kind).toBe('data')
  })

  test('skips lockfiles, minified bundles, maps and unknown types', () => {
    expect(languageForPath('package-lock.json')).toBeNull()
    expect(languageForPath('sub/bun.lock')).toBeNull()
    expect(languageForPath('Cargo.lock')).toBeNull()
    expect(languageForPath('dist/app.min.js')).toBeNull()
    expect(languageForPath('dist/app.js.map')).toBeNull()
    expect(languageForPath('logo.png')).toBeNull()
    expect(languageForPath('.gitignore')).toBeNull()
    expect(languageForPath('LICENSE')).toBeNull()
    expect(shouldCountLines('logo.png')).toBe(false)
    expect(shouldCountLines('index.ts')).toBe(true)
  })
})

describe('isTestPath', () => {
  test('recognizes common test layouts', () => {
    expect(isTestPath('src/__tests__/a.ts')).toBe(true)
    expect(isTestPath('src/a.test.ts')).toBe(true)
    expect(isTestPath('src/a.spec.tsx')).toBe(true)
    expect(isTestPath('tests/test_api.py')).toBe(true)
    expect(isTestPath('pkg/handler_test.go')).toBe(true)
    expect(isTestPath('e2e\\login.ts')).toBe(true)
    expect(isTestPath('src/contest.ts')).toBe(false)
    expect(isTestPath('src/latest/index.ts')).toBe(false)
  })
})

describe('computeWorkspaceStats', () => {
  test('totals files, test files, code lines and the language mix', () => {
    const stats = computeWorkspaceStats({
      fileCountIsLowerBound: false,
      files: [
        { path: 'src/index.ts', lines: 100 },
        { path: 'src/index.test.ts', lines: 40 },
        { path: 'src/view.tsx', lines: 60 },
        { path: 'scripts/build.py', lines: 30 },
        { path: 'README.md', lines: 500 },
        { path: 'package.json', lines: 20 },
        { path: 'bun.lock', lines: 9000 },
        { path: 'logo.png' },
      ],
    })
    expect(workspaceStatsSchema.parse(stats)).toEqual(stats)
    expect(stats).toEqual({
      fileCount: 8,
      fileCountIsLowerBound: false,
      testFileCount: 1,
      codeLineCount: 230,
      lineCountIsLowerBound: false,
      languages: [
        { name: 'Markdown', kind: 'prose', files: 1, lines: 500 },
        { name: 'TypeScript', kind: 'code', files: 3, lines: 200 },
        { name: 'Python', kind: 'code', files: 1, lines: 30 },
        { name: 'JSON', kind: 'data', files: 1, lines: 20 },
      ],
    })
  })

  test('an unread file of a counted language makes lines a floor', () => {
    const stats = computeWorkspaceStats({
      fileCountIsLowerBound: false,
      files: [{ path: 'a.ts', lines: 10 }, { path: 'b.ts' }],
    })
    expect(stats.lineCountIsLowerBound).toBe(true)
    expect(stats.languages).toEqual([
      { name: 'TypeScript', kind: 'code', files: 2, lines: 10 },
    ])
  })

  test('a capped listing makes both counts floors', () => {
    const stats = computeWorkspaceStats({
      fileCountIsLowerBound: true,
      files: [{ path: 'a.ts', lines: 10 }],
    })
    expect(stats.fileCountIsLowerBound).toBe(true)
    expect(stats.lineCountIsLowerBound).toBe(true)
  })

  test('keeps the top languages by lines, then files', () => {
    const extensions = [
      '.ts',
      '.py',
      '.go',
      '.rs',
      '.java',
      '.kt',
      '.swift',
      '.c',
      '.cpp',
      '.cs',
      '.php',
      '.dart',
      '.lua',
      '.r',
      '.ex',
      '.hs',
      '.ml',
      '.zig',
      '.nim',
      '.sol',
      '.pl',
      '.sh',
      '.sql',
      '.vue',
      '.svelte',
    ]
    const stats = computeWorkspaceStats({
      fileCountIsLowerBound: false,
      files: extensions.map((ext, i) => ({ path: `f${ext}`, lines: i + 1 })),
    })
    expect(stats.languages).toHaveLength(WORKSPACE_STATS_MAX_LANGUAGES)
    expect(stats.languages[0]).toEqual({
      name: 'Svelte',
      kind: 'code',
      files: 1,
      lines: extensions.length,
    })
    expect(workspaceStatsSchema.safeParse(stats).success).toBe(true)
  })
})

describe('buildStoredWorkspaceProfile', () => {
  const stats = computeWorkspaceStats({
    files: [
      { path: 'src/a.ts', lines: 10 },
      { path: 'src/a.test.ts', lines: 4 },
    ],
    fileCountIsLowerBound: false,
  })

  test('adds the counts as the size section beside the answers', () => {
    expect(
      buildStoredWorkspaceProfile(
        { languages: { languages: ['TypeScript'] } },
        stats,
      ),
    ).toEqual({
      languages: { languages: ['TypeScript'] },
      size: {
        file_count: 2,
        file_count_is_lower_bound: false,
        test_file_count: 1,
        code_line_count: 14,
        line_count_is_lower_bound: false,
        languages: [{ name: 'TypeScript', kind: 'code', files: 2, lines: 14 }],
      },
    })
  })

  test('size is always the counts, whatever the answers carried', () => {
    // A model can put anything in its answer; the stored size never comes from it.
    const answers = { size: { file_count: '999999' } }
    const stored = buildStoredWorkspaceProfile(answers, stats)
    expect(stored.size).toMatchObject({ file_count: 2 })
  })
})
