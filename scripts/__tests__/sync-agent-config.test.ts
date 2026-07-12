import { expect, test, beforeEach, afterEach } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  findAgentConfigSyncFindings,
  formatAgentConfigSyncReport,
} from '../sync-agent-config'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'acs-'))
})

afterEach(() => {
  if (existsSync(tmpRoot)) {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

function writeCanonicalFiles(root: string) {
  mkdirSync(join(root, 'common'), { recursive: true })
  mkdirSync(join(root, 'cli'), { recursive: true })
  mkdirSync(join(root, '.github'), { recursive: true })
  writeFileSync(join(root, 'AGENTS.md'), '# AGENTS\n')
  writeFileSync(join(root, 'common', 'knowledge.md'), '# Common\n')
  writeFileSync(join(root, 'cli', 'knowledge.md'), '# CLI\n')
  writeFileSync(join(root, '.github', 'knowledge.md'), '# GitHub\n')
}

test('findAgentConfigSyncFindings returns no findings when all canonical files exist and refs are valid', () => {
  writeCanonicalFiles(tmpRoot)
  const findings = findAgentConfigSyncFindings(tmpRoot)
  expect(findings).toEqual([])
})

test('checkCanonicalFilesExist flags missing canonical config files', () => {
  // Write only AGENTS.md, leave the other 3 missing.
  writeFileSync(join(tmpRoot, 'AGENTS.md'), '# AGENTS\n')
  const findings = findAgentConfigSyncFindings(tmpRoot)
  expect(findings.length).toBe(3)
  expect(findings.some((f) => f.file === 'common/knowledge.md')).toBe(true)
  expect(findings.some((f) => f.file === 'cli/knowledge.md')).toBe(true)
  expect(findings.some((f) => f.file === '.github/knowledge.md')).toBe(true)
})

test('checkAgentsRepoMap flags missing directory referenced in Repo Map section', () => {
  writeCanonicalFiles(tmpRoot)
  writeFileSync(
    join(tmpRoot, 'AGENTS.md'),
    '# AGENTS\n\n## Repo Map\n\n- `packages/missing-dir`\n\n## Other\n\nfoo\n',
  )
  const findings = findAgentConfigSyncFindings(tmpRoot)
  expect(findings.length).toBe(1)
  expect(findings[0].file).toBe('AGENTS.md')
  expect(findings[0].message).toContain('packages/missing-dir')
})

test('checkAgentsDocs flags missing markdown file referenced in Docs section', () => {
  writeCanonicalFiles(tmpRoot)
  writeFileSync(
    join(tmpRoot, 'AGENTS.md'),
    '# AGENTS\n\n## Docs\n\n- `docs/missing-guide.md`\n',
  )
  const findings = findAgentConfigSyncFindings(tmpRoot)
  expect(findings.length).toBe(1)
  expect(findings[0].file).toBe('AGENTS.md')
  expect(findings[0].message).toContain('docs/missing-guide.md')
})

test('checkAgentsDocs passes when referenced markdown file exists', () => {
  writeCanonicalFiles(tmpRoot)
  mkdirSync(join(tmpRoot, 'docs'), { recursive: true })
  writeFileSync(join(tmpRoot, 'docs', 'present.md'), '# Present\n')
  writeFileSync(
    join(tmpRoot, 'AGENTS.md'),
    '# AGENTS\n\n## Docs\n\n- `docs/present.md`\n',
  )
  const findings = findAgentConfigSyncFindings(tmpRoot)
  expect(findings).toEqual([])
})

test('checkCliKnowledgeReferences flags missing file reference in cli/knowledge.md', () => {
  writeCanonicalFiles(tmpRoot)
  writeFileSync(
    join(tmpRoot, 'cli', 'knowledge.md'),
    '# CLI\n\nSee `cli/src/hooks/use-missing.ts` for details.\n',
  )
  const findings = findAgentConfigSyncFindings(tmpRoot)
  expect(findings.length).toBe(1)
  expect(findings[0].file).toBe('cli/knowledge.md')
  expect(findings[0].message).toContain('cli/src/hooks/use-missing.ts')
})

test('checkCliKnowledgeReferences passes when referenced file exists', () => {
  writeCanonicalFiles(tmpRoot)
  mkdirSync(join(tmpRoot, 'cli', 'src', 'hooks'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'cli', 'src', 'hooks', 'use-present.ts'),
    '// ok\n',
  )
  writeFileSync(
    join(tmpRoot, 'cli', 'knowledge.md'),
    '# CLI\n\nSee `cli/src/hooks/use-present.ts` for details.\n',
  )
  const findings = findAgentConfigSyncFindings(tmpRoot)
  expect(findings).toEqual([])
})

test('backtick path regex does not match bare filenames without a top-level dir prefix', () => {
  writeCanonicalFiles(tmpRoot)
  // `cli-args.test.ts` should NOT match because it lacks `cli/` prefix.
  writeFileSync(
    join(tmpRoot, 'cli', 'knowledge.md'),
    '# CLI\n\nSee `cli-args.test.ts` for details.\n',
  )
  const findings = findAgentConfigSyncFindings(tmpRoot)
  expect(findings).toEqual([])
})

test('formatAgentConfigSyncReport produces passing message when no findings', () => {
  const report = formatAgentConfigSyncReport([])
  expect(report).toContain('Agent config sync guard passed')
})

test('formatAgentConfigSyncReport lists findings with file:line locations', () => {
  const report = formatAgentConfigSyncReport([
    {
      file: 'AGENTS.md',
      line: 42,
      message: 'Repo Map references `packages/missing` but it does not exist.',
    },
  ])
  expect(report).toContain('AGENTS.md:42')
  expect(report).toContain('packages/missing')
  expect(report).toContain('Fix:')
})

test('guard passes against the real repo (smoke test)', () => {
  const findings = findAgentConfigSyncFindings()
  expect(findings).toEqual([])
})
