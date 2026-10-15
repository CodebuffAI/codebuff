import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  cloudWorktreeCapabilitySchema,
  sponsoredCapabilitySchema,
} from './sponsored-capability'
import {
  agenticOfferLocalCapabilitySchema,
  parseAgenticOfferRepoFacts,
} from './agentic-offer'
import {
  WEB_CAPABILITY_COMMAND,
  cloudProjectWorkspaceId,
  cloudSponsoredCapability,
  parseWebWorktreeFacts,
  webWorktreeCapability,
  webWorktreeRepoFacts,
} from './web-agentic-offer'

const WORKSPACE = '7d1e2f3a-4b5c-5d6e-8f70-112233445566'

describe('cloudProjectWorkspaceId', () => {
  test('a UUID project id is the key itself, lowercased', () => {
    expect(cloudProjectWorkspaceId(WORKSPACE.toUpperCase())).toBe(WORKSPACE)
  })

  test('any other id maps to a stable UUID the wire accepts', () => {
    const id = cloudProjectWorkspaceId('proj_abc-123')
    expect(id).toBe(cloudProjectWorkspaceId('proj_abc-123'))
    expect(id).not.toBe(cloudProjectWorkspaceId('proj_abc-124'))
    expect(
      sponsoredCapabilitySchema.shape.target.safeParse({
        kind: 'workspace',
        workspaceId: id,
      }).success,
    ).toBe(true)
    expect(id[14]).toBe('5')
  })
})

describe('the worktree capability', () => {
  test('the command, run in a real repository, reads as a Next.js workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'web-capability-'))
    try {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ dependencies: { next: '15.0.0', react: '19.0.0' } }),
      )
      writeFileSync(join(root, 'bun.lock'), '')
      const git = (...args: string[]) =>
        spawnSync('git', args, { cwd: root, encoding: 'utf8' })
      git('init', '-q')
      git('add', '.')
      git(
        '-c',
        'user.email=t@example.com',
        '-c',
        'user.name=t',
        'commit',
        '-qm',
        'init',
      )
      const run = spawnSync('sh', ['-c', WEB_CAPABILITY_COMMAND], {
        cwd: root,
        encoding: 'utf8',
      })
      expect(run.status).toBe(0)
      const facts = parseWebWorktreeFacts(run.stdout)
      expect(facts.insideWorkTree).toBe(true)
      expect(facts.head).toMatch(/^[0-9a-f]{40}$/)
      expect(facts.files.sort()).toEqual(['bun.lock', 'package.json'])
      const capability = webWorktreeCapability(facts, WORKSPACE)
      expect(capability.capabilityInspection).toEqual({ status: 'available' })
      expect(capability.cloudCapability).toMatchObject({
        target: { kind: 'workspace', workspaceId: WORKSPACE },
        framework: 'nextjs',
        packageManager: 'bun',
        hasCommittedHead: true,
      })
      expect(capability.cloudCapability).not.toHaveProperty('execution')
      // Both shapes are what the offer route parses.
      expect(
        cloudWorktreeCapabilitySchema.safeParse(capability.cloudCapability)
          .success,
      ).toBe(true)
      expect(
        agenticOfferLocalCapabilitySchema.safeParse(capability.localCapability)
          .success,
      ).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('an output cap cuts only the file list, never the manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'web-capability-'))
    try {
      // No trailing newline: the file marker must still start its own line.
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ dependencies: { next: '15.0.0' } }),
      )
      for (let i = 0; i < 50; i += 1) writeFileSync(join(root, `f${i}.ts`), '')
      const git = (...args: string[]) =>
        spawnSync('git', args, { cwd: root, encoding: 'utf8' })
      git('init', '-q')
      git('add', '.')
      git(
        '-c',
        'user.email=t@example.com',
        '-c',
        'user.name=t',
        'commit',
        '-qm',
        'init',
      )
      const run = spawnSync('sh', ['-c', WEB_CAPABILITY_COMMAND], {
        cwd: root,
        encoding: 'utf8',
      })
      // Cut at the listed file, not the first "f1": the HEAD hash may hold one.
      const cut = run.stdout.slice(
        0,
        run.stdout.indexOf('\nf1.ts') + '\nf1.ts'.length,
      )
      const facts = parseWebWorktreeFacts(cut)
      expect(facts.manifest).toContain('"next"')
      expect(facts.runtimes.length).toBeGreaterThan(0)
      expect(facts.files[0]).toBe('f0.ts')
      expect(facts.files.length).toBeLessThan(51)
      expect(
        webWorktreeCapability(facts, WORKSPACE).cloudCapability,
      ).toMatchObject({
        framework: 'nextjs',
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('outside a repository, or with no commit, there is no capability', () => {
    const root = mkdtempSync(join(tmpdir(), 'web-capability-'))
    try {
      const run = spawnSync('sh', ['-c', WEB_CAPABILITY_COMMAND], {
        cwd: root,
        encoding: 'utf8',
      })
      expect(run.status).toBe(0)
      expect(
        webWorktreeCapability(parseWebWorktreeFacts(run.stdout), WORKSPACE),
      ).toEqual({
        cloudCapability: null,
        localCapability: null,
        capabilityInspection: {
          status: 'unavailable',
          reason: 'no_git_repository',
        },
      })
      spawnSync('git', ['init', '-q'], { cwd: root })
      const empty = spawnSync('sh', ['-c', WEB_CAPABILITY_COMMAND], {
        cwd: root,
        encoding: 'utf8',
      })
      expect(
        webWorktreeCapability(parseWebWorktreeFacts(empty.stdout), WORKSPACE)
          .capabilityInspection,
      ).toEqual({ status: 'unavailable', reason: 'no_committed_head' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('framework and package manager follow the CLI rules', () => {
    const facts = (manifest: object | null, files: string[] = []) =>
      webWorktreeCapability(
        {
          insideWorkTree: true,
          head: 'abc',
          files,
          runtimes: ['node'],
          manifest: manifest === null ? null : JSON.stringify(manifest),
        },
        WORKSPACE,
      ).cloudCapability
    expect(
      facts({ dependencies: { react: '1', vite: '1' } }, ['pnpm-lock.yaml']),
    ).toMatchObject({ framework: 'react-vite', packageManager: 'pnpm' })
    expect(facts({ dependencies: { express: '1' } })).toMatchObject({
      framework: 'nodejs',
    })
    expect(facts({ dependencies: { vue: '1' } })).toMatchObject({
      framework: 'unsupported',
    })
    expect(facts(null)).toMatchObject({ framework: 'unknown' })
    expect(
      facts({ dependencies: { '@supabase/supabase-js': '1' } }, [
        'supabase/migrations/1.sql',
      ]),
    ).toMatchObject({
      hasSupabaseBoundary: true,
      hasCommittedDatabaseBoundary: true,
    })
    expect(
      webWorktreeCapability(
        {
          insideWorkTree: true,
          head: 'abc',
          files: [],
          runtimes: [],
          manifest: '{not json',
        },
        WORKSPACE,
      ).capabilityInspection,
    ).toEqual({ status: 'unavailable', reason: 'unreadable_package_manifest' })
  })

  test('runtimes map python3 to python and drop anything unknown', () => {
    const output = [
      '@@freebuff-capability:runtimes',
      'node',
      'python3',
      'python',
      'ruby',
    ].join('\n')
    expect(parseWebWorktreeFacts(output).runtimes).toEqual(['node', 'python'])
  })
})

describe('the cloud execution is server-assigned', () => {
  test('the route adds cloud_linux; the wire cannot claim it', () => {
    const facts = webWorktreeCapability(
      {
        insideWorkTree: true,
        head: 'abc',
        files: [],
        runtimes: ['node'],
        manifest: null,
      },
      WORKSPACE,
    ).cloudCapability!
    expect(cloudSponsoredCapability(facts).execution).toEqual({
      surface: 'cloud_linux',
      status: 'available',
      outboundNetwork: true,
    })
    // A client sending the same thing as its own capability is refused.
    expect(
      sponsoredCapabilitySchema.safeParse(cloudSponsoredCapability(facts))
        .success,
    ).toBe(false)
    // And worktree facts carrying an execution do not parse either.
    expect(
      cloudWorktreeCapabilitySchema.safeParse({
        ...facts,
        execution: { surface: 'cloud_linux', status: 'available' },
      }).success,
    ).toBe(false)
  })
})

describe('the worktree fit facts (Track A5)', () => {
  test('the command prints the fit manifests, shallowest first, and the facts parse on the route', async () => {
    const root = mkdtempSync(join(tmpdir(), 'web-fit-'))
    try {
      mkdirSync(join(root, 'api'))
      mkdirSync(join(root, 'web/node_modules/x'), { recursive: true })
      writeFileSync(
        join(root, 'api/pyproject.toml'),
        '[project]\nname = "api"\ndependencies = [\n  "fastapi[standard]>=0.115",\n  "openai>=1",\n]\n',
      )
      writeFileSync(join(root, 'requirements.txt'), 'flask==3.0.0\n')
      writeFileSync(
        join(root, 'web/package.json'),
        JSON.stringify({ devDependencies: { vite: '5' } }),
      )
      writeFileSync(join(root, 'web/node_modules/x/package.json'), '{"dependencies":{"evil":"1"}}')
      writeFileSync(join(root, '.coderabbit.yaml'), '\n')
      writeFileSync(join(root, 'main.py'), 'print(1)')
      const git = (...args: string[]) =>
        spawnSync('git', args, { cwd: root, encoding: 'utf8' })
      git('init', '-q')
      git('add', '-f', '.')
      git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-qm', 'init')
      const run = spawnSync('sh', ['-c', WEB_CAPABILITY_COMMAND], { cwd: root, encoding: 'utf8' })
      expect(run.status).toBe(0)
      const worktree = parseWebWorktreeFacts(run.stdout)
      expect([...(worktree.fitFiles?.keys() ?? [])]).toEqual([
        '.coderabbit.yaml',
        'requirements.txt',
        'api/pyproject.toml',
        'web/package.json',
      ])
      // The other sections still read as before.
      expect(worktree.files).toContain('main.py')
      const facts = await webWorktreeRepoFacts(worktree)
      expect(facts).toMatchObject({
        complete: true,
        empty: ['.coderabbit.yaml'],
        manifests: [
          { path: 'api/pyproject.toml', ecosystem: 'pypi', names: ['fastapi', 'openai'], complete: true },
          { path: 'requirements.txt', ecosystem: 'pypi', names: ['flask'], complete: true },
          { path: 'web/package.json', ecosystem: 'npm', names: ['vite'], complete: true },
        ],
      })
      expect(JSON.stringify(facts)).not.toContain('evil')
      expect(parseAgenticOfferRepoFacts(facts)).toEqual(facts)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('an untracked manifest counts, as it does for the run’s preflight', async () => {
    const root = mkdtempSync(join(tmpdir(), 'web-fit-untracked-'))
    try {
      writeFileSync(join(root, 'README.md'), 'hi')
      writeFileSync(join(root, '.gitignore'), 'ignored/\n')
      const git = (...args: string[]) =>
        spawnSync('git', args, { cwd: root, encoding: 'utf8' })
      git('init', '-q')
      git('add', '.')
      git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-qm', 'init')
      // Created after the commit and never added: untracked, not ignored.
      writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { next: '15' } }))
      mkdirSync(join(root, 'ignored'))
      writeFileSync(join(root, 'ignored/pyproject.toml'), '[project]\ndependencies = ["django"]\n')
      const run = spawnSync('sh', ['-c', WEB_CAPABILITY_COMMAND], { cwd: root, encoding: 'utf8' })
      const worktree = parseWebWorktreeFacts(run.stdout)
      expect(worktree.files).not.toContain('package.json')
      const facts = await webWorktreeRepoFacts(worktree)
      expect(facts).toMatchObject({
        paths: ['package.json'],
        complete: true,
        manifests: [{ path: 'package.json', names: ['next'], complete: true }],
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('a fit listing that did not finish proves no absence', async () => {
    const cut = parseWebWorktreeFacts(
      ['@@freebuff-capability:inside', 'true', '@@freebuff-capability:fitpaths', 'package.json'].join('\n'),
    )
    expect(cut.fitPaths).toBeNull()
    expect((await webWorktreeRepoFacts(cut))?.complete).toBe(false)
  })

  test('outside a work tree there are no facts', async () => {
    expect(await webWorktreeRepoFacts(parseWebWorktreeFacts(''))).toBeNull()
  })
})
