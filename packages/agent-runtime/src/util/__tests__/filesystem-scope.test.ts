import { describe, expect, test } from 'bun:test'

import {
  narrowFilesystemPatterns,
  scopePatternMatches,
} from '../filesystem-scope'

describe('filesystem scope matching', () => {
  test('globstar matches root-level and nested paths', () => {
    expect(scopePatternMatches('docker', '**/*')).toBe(true)
    expect(scopePatternMatches('.github', '**/*')).toBe(true)
    expect(scopePatternMatches('docker/backup.sh', '**/*')).toBe(true)
    expect(scopePatternMatches('.github/workflows/ci.yml', '**/*')).toBe(true)
  })

  test('recursive directory scopes include the directory itself', () => {
    expect(scopePatternMatches('docs', 'docs/**')).toBe(true)
    expect(scopePatternMatches('docs/api/index.md', 'docs/**')).toBe(true)
    expect(scopePatternMatches('server/src/__tests__', '**/__tests__/**')).toBe(
      true,
    )
    expect(
      scopePatternMatches(
        'server/src/__tests__/worker.test.ts',
        '**/__tests__/**',
      ),
    ).toBe(true)
  })

  test('does not broaden a recursive scope to sibling directories', () => {
    expect(scopePatternMatches('src/index.ts', 'docs/**')).toBe(false)
    expect(scopePatternMatches('server/src/tests', '**/__tests__/**')).toBe(
      false,
    )
  })

  test('allows root-level handoff paths under an all-project scope', () => {
    expect(
      narrowFilesystemPatterns({
        requested: ['docker', '.github'],
        staticPatterns: ['**/*'],
        projectRoot: '/workspace',
        access: 'read',
        agentId: 'general-agent',
      }),
    ).toEqual(['docker', '.github'])
  })
})
