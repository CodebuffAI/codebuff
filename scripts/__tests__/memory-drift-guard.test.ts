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
import { execSync } from 'node:child_process'

import {
  runMemoryDriftGuard,
  formatMemoryDriftReport,
  checkPath,
  checkEdges,
  checkIndexSync,
  checkStaleness,
  checkCommand,
  checkDependency,
  checkCrossFile,
  checkScriptCoverage,
  checkToolConfigSync,
  checkTodoFixme,
  checkBrokenLink,
} from '../memory-drift-guard'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'mdg-'))
})

afterEach(() => {
  if (existsSync(tmpRoot)) {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

/** Initialize a temp git repo with a deterministic identity for commits. */
function initGitRepo(root: string): void {
  execSync('git init -q', { cwd: root })
  execSync('git config user.email test@example.com', { cwd: root })
  execSync('git config user.name Test', { cwd: root })
  // Allow commits even when there are no branches yet.
  execSync('git config commit.gpgsign false', { cwd: root })
}

/** Stage and commit `paths` with a backdated committer date (ISO 8601). */
function gitCommit(root: string, paths: string[], message: string, dateIso: string): void {
  for (const p of paths) {
    execSync(`git add -- ${JSON.stringify(p)}`, { cwd: root })
  }
  execSync(`git commit -q -m ${JSON.stringify(message)} --date ${JSON.stringify(dateIso)}`, {
    cwd: root,
    env: { ...process.env, GIT_AUTHOR_DATE: dateIso, GIT_COMMITTER_DATE: dateIso },
  })
}

test('path checker flags missing backtick-quoted repo-relative path', () => {
  mkdirSync(join(tmpRoot, 'docs'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'docs', 'notes.md'),
    'See `src/missing.ts` for details.\n',
  )
  const findings = checkPath(tmpRoot)
  expect(findings.length).toBeGreaterThanOrEqual(1)
  expect(findings.some((f) => f.message.includes('src/missing.ts'))).toBe(true)
})

test('edges checker flags missing architectural directory', () => {
  mkdirSync(join(tmpRoot, 'docs'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'docs', 'knowledge.md'),
    '## Architecture\n\n- `nonexistent-dir`\n',
  )
  const findings = checkEdges(tmpRoot)
  expect(findings.length).toBeGreaterThanOrEqual(1)
  expect(findings.some((f) => f.message.includes('nonexistent-dir'))).toBe(true)
})

test('index-sync checker flags missing file referenced in AGENTS.md', () => {
  writeFileSync(
    join(tmpRoot, 'AGENTS.md'),
    'See [guide](docs/gone.md) and `src/absent.ts`.\n',
  )
  const findings = checkIndexSync(tmpRoot)
  expect(findings.length).toBeGreaterThanOrEqual(1)
})

test('staleness checker flags knowledge.md with older last commit than sibling src/', () => {
  // Set up a real git repo so the git-log-based staleness check has signal.
  initGitRepo(tmpRoot)
  mkdirSync(join(tmpRoot, 'packages', 'demo', 'src'), { recursive: true })
  const knowledgePath = join(tmpRoot, 'packages', 'demo', 'knowledge.md')
  writeFileSync(knowledgePath, '# demo\n')
  // Commit knowledge.md with an old timestamp.
  gitCommit(tmpRoot, ['packages/demo/knowledge.md'], 'add knowledge', '2023-01-01T00:00:00')
  // Add a source file under src/ and commit it with a newer timestamp.
  writeFileSync(join(tmpRoot, 'packages', 'demo', 'src', 'index.ts'), 'export const x = 1\n')
  gitCommit(tmpRoot, ['packages/demo/src/index.ts'], 'add src', '2024-06-01T00:00:00')
  const findings = checkStaleness(tmpRoot)
  expect(findings.length).toBeGreaterThanOrEqual(1)
  expect(findings.some((f) => f.message.includes('stale'))).toBe(true)
})

test('staleness checker skips dirty knowledge.md before freshness commit lands', () => {
  initGitRepo(tmpRoot)
  mkdirSync(join(tmpRoot, 'packages', 'demo', 'src'), { recursive: true })
  const knowledgePath = join(tmpRoot, 'packages', 'demo', 'knowledge.md')
  writeFileSync(knowledgePath, '# demo\n')
  gitCommit(tmpRoot, ['packages/demo/knowledge.md'], 'add knowledge', '2023-01-01T00:00:00')
  writeFileSync(join(tmpRoot, 'packages', 'demo', 'src', 'index.ts'), 'export const x = 1\n')
  gitCommit(tmpRoot, ['packages/demo/src/index.ts'], 'add src', '2024-06-01T00:00:00')

  writeFileSync(knowledgePath, '# demo\n\nUpdated local notes.\n')

  const findings = checkStaleness(tmpRoot)
  expect(findings.some((f) => f.path.includes('knowledge.md'))).toBe(false)
})

test('staleness checker does NOT flag knowledge.md when its last commit is newer than src/', () => {
  initGitRepo(tmpRoot)
  mkdirSync(join(tmpRoot, 'packages', 'demo', 'src'), { recursive: true })
  const knowledgePath = join(tmpRoot, 'packages', 'demo', 'knowledge.md')
  writeFileSync(knowledgePath, '# demo\n')
  writeFileSync(join(tmpRoot, 'packages', 'demo', 'src', 'index.ts'), 'export const x = 1\n')
  // Commit src first (older), then knowledge.md (newer) — not stale.
  gitCommit(tmpRoot, ['packages/demo/src/index.ts'], 'add src', '2023-01-01T00:00:00')
  gitCommit(tmpRoot, ['packages/demo/knowledge.md'], 'add knowledge', '2024-06-01T00:00:00')
  const findings = checkStaleness(tmpRoot)
  expect(findings.some((f) => f.path.includes('knowledge.md'))).toBe(false)
})

test('staleness checker skips untracked knowledge.md (no false positive without git history)', () => {
  // No git repo at all — lastCommitEpoch returns null, so the checker skips.
  mkdirSync(join(tmpRoot, 'packages', 'demo', 'src'), { recursive: true })
  writeFileSync(join(tmpRoot, 'packages', 'demo', 'knowledge.md'), '# demo\n')
  const findings = checkStaleness(tmpRoot)
  expect(findings.length).toBe(0)
})

test('staleness checker skips untracked knowledge.md in a git repo', () => {
  initGitRepo(tmpRoot)
  mkdirSync(join(tmpRoot, 'packages', 'demo', 'src'), { recursive: true })
  writeFileSync(join(tmpRoot, 'packages', 'demo', 'src', 'index.ts'), 'export const x = 1\n')
  gitCommit(tmpRoot, ['packages/demo/src/index.ts'], 'add src', '2024-06-01T00:00:00')

  writeFileSync(join(tmpRoot, 'packages', 'demo', 'knowledge.md'), '# demo\n')

  const findings = checkStaleness(tmpRoot)
  expect(findings.some((f) => f.path.includes('knowledge.md'))).toBe(false)
})

test('command checker flags missing script via --cwd subpackage', () => {
  mkdirSync(join(tmpRoot, 'cli'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'cli', 'package.json'),
    JSON.stringify({ name: 'cli', scripts: { present: 'echo' } }),
  )
  mkdirSync(join(tmpRoot, 'docs'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'docs', 'cmd.md'),
    'Run `bun --cwd=cli run missing`.\n',
  )
  const findings = checkCommand(tmpRoot)
  expect(findings.length).toBeGreaterThanOrEqual(1)
  expect(findings.some((f) => f.message.includes('missing'))).toBe(true)
})

test('command checker skips file-path fragments like `evals` from `bun run evals/foo.ts`', () => {
  mkdirSync(join(tmpRoot, 'docs'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'docs', 'cmd.md'),
    'Run `bun run evals/buffbench/main.ts`.\n',
  )
  const findings = checkCommand(tmpRoot)
  expect(findings.some((f) => f.message.includes('`evals`'))).toBe(false)
})

test('command checker skips --cwd flag fragment when placeholder follows', () => {
  mkdirSync(join(tmpRoot, 'docs'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'docs', 'cmd.md'),
    'Run `bun run --cwd <workspace> <script>`.\n',
  )
  const findings = checkCommand(tmpRoot)
  expect(findings.some((f) => f.message.includes('`--cwd`'))).toBe(false)
})

test('command checker skips out-of-repo absolute --cwd paths', () => {
  mkdirSync(join(tmpRoot, 'docs'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'docs', 'cmd.md'),
    'Run `bun --cwd /home/user/Code/other-repo run typecheck`.\n',
  )
  const findings = checkCommand(tmpRoot)
  // Should not report a finding against the out-of-repo package.json path
  expect(
    findings.some((f) => f.message.includes('/other-repo')),
  ).toBe(false)
})

test('command checker infers cwd from `cd <dir> &&` prefix on same line', () => {
  mkdirSync(join(tmpRoot, 'cli'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'cli', 'package.json'),
    JSON.stringify({ name: 'cli', scripts: { build: 'echo' } }),
  )
  mkdirSync(join(tmpRoot, 'docs'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'docs', 'cmd.md'),
    'Run `cd cli && bun run build`.\n',
  )
  const findings = checkCommand(tmpRoot)
  expect(findings.some((f) => f.message.includes('`build`'))).toBe(false)
})

test('command checker skips out-of-repo `cd <dir> &&` prefix', () => {
  mkdirSync(join(tmpRoot, 'docs'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'docs', 'cmd.md'),
    'Run `cd /home/user/Code/other-repo && bun run typecheck`.\n',
  )
  const findings = checkCommand(tmpRoot)
  expect(
    findings.some((f) => f.message.includes('/other-repo')),
  ).toBe(false)
})

test('dependency checker flags missing @codebuff package', () => {
  mkdirSync(join(tmpRoot, 'packages', 'fake'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'packages', 'fake', 'package.json'),
    JSON.stringify({ name: '@codebuff/fake' }),
  )
  writeFileSync(
    join(tmpRoot, 'package.json'),
    JSON.stringify({ name: 'root' }),
  )
  mkdirSync(join(tmpRoot, 'docs'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'docs', 'dep.md'),
    "import a from '@codebuff/fake'\nimport b from '@codebuff/missing'\n",
  )
  const findings = checkDependency(tmpRoot)
  expect(findings.length).toBeGreaterThanOrEqual(1)
  expect(findings.some((f) => f.message.includes('@codebuff/missing'))).toBe(
    true,
  )
  expect(findings.some((f) => f.message.includes('@codebuff/fake'))).toBe(false)
})

test('cross-file checker flags missing relative markdown link', () => {
  mkdirSync(join(tmpRoot, 'docs'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'docs', 'index.md'),
    'See [other](./missing.md).\n',
  )
  const findings = checkCrossFile(tmpRoot)
  expect(findings.length).toBeGreaterThanOrEqual(1)
  expect(findings.some((f) => f.message.includes('missing.md'))).toBe(true)
})

test('script-coverage checker flags unmentioned script', () => {
  mkdirSync(join(tmpRoot, 'scripts'), { recursive: true })
  writeFileSync(join(tmpRoot, 'scripts', 'ghost-tool.ts'), '// no docs\n')
  writeFileSync(
    join(tmpRoot, 'scripts', 'package.json'),
    JSON.stringify({ scripts: {} }),
  )
  const findings = checkScriptCoverage(tmpRoot)
  expect(findings.length).toBeGreaterThanOrEqual(1)
  expect(findings.some((f) => f.path.includes('ghost-tool.ts'))).toBe(true)
})

test('script-coverage checker respects .coverage-allow allowlist', () => {
  mkdirSync(join(tmpRoot, 'scripts'), { recursive: true })
  writeFileSync(join(tmpRoot, 'scripts', 'ad-hoc-tool.ts'), '// no docs\n')
  writeFileSync(join(tmpRoot, 'scripts', 'package.json'),
    JSON.stringify({ scripts: {} }),
  )
  writeFileSync(join(tmpRoot, 'scripts', '.coverage-allow'), 'ad-hoc-tool.ts\n')
  const findings = checkScriptCoverage(tmpRoot)
  expect(findings.some((f) => f.path.includes('ad-hoc-tool.ts'))).toBe(false)
})

test('tool-config-sync checker flags missing ROUTER.md referenced file', () => {
  writeFileSync(
    join(tmpRoot, 'ROUTER.md'),
    '| Tool | Path |\n| --- | --- |\n| X | `tools/missing.ts` |\n',
  )
  const findings = checkToolConfigSync(tmpRoot)
  expect(findings.length).toBeGreaterThanOrEqual(1)
})

test('tool-config-sync returns no findings when ROUTER.md absent', () => {
  const findings = checkToolConfigSync(tmpRoot)
  expect(findings).toEqual([])
})

test('index-sync checker covers agents/patterns/INDEX.md and flags missing referenced file', () => {
  mkdirSync(join(tmpRoot, 'agents', 'patterns'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'agents', 'patterns', 'INDEX.md'),
    '| pattern | file | description |\n| --- | --- | --- |\n| add-a-new-tool | `agents/patterns/missing-guide.md` | Add a tool |\n',
  )
  const findings = checkIndexSync(tmpRoot)
  expect(findings.length).toBeGreaterThanOrEqual(1)
  expect(
    findings.some((f) => f.path === 'agents/patterns/INDEX.md'),
  ).toBe(true)
})

test('index-sync returns no findings for patterns INDEX when all referenced files exist', () => {
  mkdirSync(join(tmpRoot, 'agents', 'patterns'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'agents', 'patterns', 'present.md'),
    '# Present pattern\n',
  )
  writeFileSync(
    join(tmpRoot, 'agents', 'patterns', 'INDEX.md'),
    '| pattern | file | description |\n| --- | --- | --- |\n| present | `agents/patterns/present.md` | Present |\n',
  )
  const findings = checkIndexSync(tmpRoot)
  expect(
    findings.filter((f) => f.path === 'agents/patterns/INDEX.md'),
  ).toEqual([])
})

test('memory-drift guard skips .bun-install cache directories', () => {
  // Simulate a bun install cache containing a markdown file with broken links
  // and a missing repo-relative path. The guard must not descend into
  // `.bun-install` (third-party package READMEs are non-actionable noise).
  mkdirSync(join(tmpRoot, '.bun-install', 'install', 'cache', 'pkg'), {
    recursive: true,
  })
  writeFileSync(
    join(tmpRoot, '.bun-install', 'install', 'cache', 'pkg', 'README.md'),
    'See `src/missing.ts` and [gone](./gone.md).\n',
  )
  const pathFindings = checkPath(tmpRoot)
  const brokenFindings = checkBrokenLink(tmpRoot)
  const touched = (f: { path: string }) =>
    f.path.includes('.bun-install')
  expect(pathFindings.some(touched)).toBe(false)
  expect(brokenFindings.some(touched)).toBe(false)
})

test('todo-fixme checker flags TODO and allows allowlisted line', () => {
  mkdirSync(join(tmpRoot, 'docs'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'docs', 'todo.md'),
    'TODO: fix this\nFIXME: later\nallowed <!-- allow-todo --> TODO: here\n',
  )
  const findings = checkTodoFixme(tmpRoot)
  expect(findings.length).toBeGreaterThanOrEqual(1)
  expect(findings.some((f) => f.message.includes('TODO/FIXME'))).toBe(true)
  // The allowlisted line should not produce a finding
  expect(findings.some((f) => f.line === 3)).toBe(false)
})

test('todo-fixme checker skips feature-name usage like "TODO List Positioning"', () => {
  mkdirSync(join(tmpRoot, 'docs'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'docs', 'features.md'),
    [
      '## TODO List Positioning',
      '',
      'The TODO List widget renders at the top.',
      '',
      '### FIXME notes section',
      '',
      'This section documents FIXME history.',
    ].join('\n'),
  )
  const findings = checkTodoFixme(tmpRoot)
  // "TODO List" and "FIXME notes" are feature/section names, not markers.
  // The regex requires `:` or `(` after the marker word, so these must not flag.
  expect(findings.some((f) => f.path.includes('features.md'))).toBe(false)
})

test('todo-fixme checker still flags TODO(...) parenthesized form', () => {
  mkdirSync(join(tmpRoot, 'docs'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'docs', 'marker.md'),
    'TODO(jane): refactor this later\n',
  )
  const findings = checkTodoFixme(tmpRoot)
  expect(findings.length).toBeGreaterThanOrEqual(1)
  expect(findings.some((f) => f.message.includes('TODO/FIXME'))).toBe(true)
})

test('broken-link checker flags missing non-http link', () => {
  mkdirSync(join(tmpRoot, 'docs'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'docs', 'page.md'),
    'See [guide](./absent.md) and [ext](https://example.com).\n',
  )
  const findings = checkBrokenLink(tmpRoot)
  expect(findings.length).toBeGreaterThanOrEqual(1)
  expect(findings.some((f) => f.message.includes('absent.md'))).toBe(true)
})

test('broken-link checker skips anchor fragments on existing file', () => {
  // Links like `./request-flow.md#reviewer--validation-gate-semantics` should
  // resolve to the file `request-flow.md` (ignoring the `#anchor` fragment).
  // The M5 fix strips the fragment before existsSync, so this must not flag.
  mkdirSync(join(tmpRoot, 'docs'), { recursive: true })
  writeFileSync(join(tmpRoot, 'docs', 'request-flow.md'), '# Request Flow\n\n## Reviewer / validation gate semantics\n')
  writeFileSync(
    join(tmpRoot, 'docs', 'page.md'),
    'See [flow](./request-flow.md#reviewer--validation-gate-semantics).\n',
  )
  const findings = checkBrokenLink(tmpRoot)
  expect(findings.some((f) => f.message.includes('request-flow.md'))).toBe(false)
})

test('integration: runMemoryDriftGuard returns sum score and 11 checkers in order', () => {
  // Build a fixture that triggers at least one finding per checker.
  mkdirSync(join(tmpRoot, 'docs'), { recursive: true })
  writeFileSync(
    join(tmpRoot, 'docs', 'notes.md'),
    [
      'See `src/missing.ts`.',
      'See [other](./gone.md).',
      'TODO: fix later',
      '',
      "import x from '@codebuff/missing'",
      'Run `bun run absent`.',
    ].join('\n'),
  )

  initGitRepo(tmpRoot)
  mkdirSync(join(tmpRoot, 'packages', 'demo', 'src'), { recursive: true })
  const knowledgePath = join(tmpRoot, 'packages', 'demo', 'knowledge.md')
  writeFileSync(
    knowledgePath,
    [
      '# demo',
      '',
      '## Architecture',
      '',
      '- `nope-dir`',
    ].join('\n'),
  )
  // Commit knowledge.md (old) then a src file (newer) so staleness fires.
  gitCommit(tmpRoot, ['packages/demo/knowledge.md'], 'add knowledge', '2023-01-01T00:00:00')
  writeFileSync(join(tmpRoot, 'packages', 'demo', 'src', 'index.ts'), 'export const x = 1\n')
  gitCommit(tmpRoot, ['packages/demo/src/index.ts'], 'add src', '2024-06-01T00:00:00')

  writeFileSync(
    join(tmpRoot, 'AGENTS.md'),
    'See [guide](docs/absent.md) and `src/absent.ts`.\n',
  )
  writeFileSync(
    join(tmpRoot, 'ROUTER.md'),
    '| Tool | Path |\n| --- | --- |\n| X | `tools/missing.ts` |\n',
  )

  mkdirSync(join(tmpRoot, 'scripts'), { recursive: true })
  writeFileSync(join(tmpRoot, 'scripts', 'ghost-tool.ts'), '// no docs\n')
  writeFileSync(
    join(tmpRoot, 'scripts', 'package.json'),
    JSON.stringify({ scripts: {} }),
  )

  const result = runMemoryDriftGuard(tmpRoot)
  expect(result.checkers.length).toBe(11)
  const expectedNames = [
    'path',
    'edges',
    'index-sync',
    'staleness',
    'command',
    'dependency',
    'cross-file',
    'script-coverage',
    'tool-config-sync',
    'todo-fixme',
    'broken-link',
  ]
  expect(result.checkers.map((c) => c.name)).toEqual(expectedNames)
  const sum = result.checkers.reduce((s, c) => s + c.findings.length, 0)
  expect(result.score).toBe(sum)
  // Every checker should have at least one finding in this combined fixture.
  for (const checker of result.checkers) {
    expect(checker.findings.length).toBeGreaterThanOrEqual(1)
  }
  const report = formatMemoryDriftReport(result)
  expect(report.startsWith('Memory drift guard:')).toBe(true)
})