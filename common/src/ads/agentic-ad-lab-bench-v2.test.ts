import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { publicRepositorySpec } from './agentic-ad-lab'
import { LAB_BATCH_MAX_REPOSITORIES } from './agentic-ad-lab-batch'
import { LAB_BENCH, labBenchSpec } from './agentic-ad-lab-bench'
import {
  LAB_BENCH_V2,
  LAB_BENCH_V2_BUCKETS,
  labBenchAnyEntry,
  labBenchPinSpec,
  labBenchV2Core,
  labBenchV2Entry,
  labBenchV2Repositories,
  type LabBenchV2Bucket,
  type LabBenchV2Entry,
  type LabBenchV2Facets,
} from './agentic-ad-lab-bench-v2'

const inBucket = (bucket: LabBenchV2Bucket) =>
  LAB_BENCH_V2.filter((e) => e.bucket === bucket)

function tally<K extends keyof LabBenchV2Facets>(
  entries: readonly LabBenchV2Entry[],
  facet: K,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of entries) {
    const key = String(e.facets[facet])
    out[key] = (out[key] ?? 0) + 1
  }
  return out
}

describe('bench-v2 pool', () => {
  test('is 62 distinct entries; every GitHub entry is pinned to a full SHA the lab accepts', () => {
    expect(LAB_BENCH_V2.length).toBe(62)
    expect(new Set(LAB_BENCH_V2.map((e) => e.key)).size).toBe(62)
    for (const entry of labBenchV2Repositories()) {
      expect(entry.key).toBe(entry.fullName.toLowerCase())
      expect(entry.commit).toMatch(/^[0-9a-f]{40}$/)
      expect(publicRepositorySpec(labBenchPinSpec(entry))).toEqual({
        fullName: entry.fullName,
        commit: entry.commit,
      })
    }
  })

  test('a repository bench-v1 also has carries the v1 commit and former name, so a lab holds it once', () => {
    let shared = 0
    for (const entry of labBenchV2Repositories()) {
      const v1 = LAB_BENCH.find(
        (e) => e.fullName.toLowerCase() === entry.fullName.toLowerCase(),
      )
      if (!v1) continue
      shared++
      expect(entry.commit).toBe(v1.commit)
      expect(entry.formerly).toBe(v1.formerly)
      expect(labBenchAnyEntry(entry.fullName, entry.commit)).toBe(v1)
    }
    expect(shared).toBeGreaterThan(0)
    // A v2-only repository resolves to its own entry.
    const own = labBenchV2Repositories().find(
      (e) => !LAB_BENCH.some((v1) => v1.fullName === e.fullName),
    )!
    expect(labBenchAnyEntry(own.fullName, own.commit)?.fullName).toBe(
      own.fullName,
    )
    expect(labBenchAnyEntry(own.fullName, 'a'.repeat(40))).toBeNull()
  })

  test('meets the bucket quotas', () => {
    const counts = Object.fromEntries(
      LAB_BENCH_V2_BUCKETS.map((b) => [b, inBucket(b).length]),
    )
    expect(counts).toEqual({
      nextjs: 8,
      'react-vite': 8,
      'node-api': 6,
      'frontend-control': 3,
      'js-monorepo': 4,
      supabase: 4,
      fastapi: 5,
      django: 3,
      flask: 2,
      'python-llm': 5,
      'python-script': 2,
      polyglot: 2,
      'other-language': 4,
      'static-html': 1,
      fixture: 5,
    })
  })

  test('spreads the package managers each ecosystem uses', () => {
    const js = { npm: 3, pnpm: 2, bun: 2, yarn: 1 }
    expect(tally(inBucket('nextjs'), 'packageManager')).toEqual(js)
    expect(tally(inBucket('nextjs'), 'framework')).toEqual({ nextjs: 8 })
    expect(tally(inBucket('react-vite'), 'packageManager')).toEqual(js)
    expect(tally(inBucket('react-vite'), 'framework')).toEqual({
      'react-vite': 8,
    })
    expect(tally(inBucket('react-vite'), 'convex')).toEqual({
      true: 2,
      false: 6,
    })
    expect(tally(inBucket('node-api'), 'packageManager')).toEqual({
      npm: 3,
      yarn: 1,
      pnpm: 1,
      bun: 1,
    })
    for (const e of inBucket('frontend-control')) {
      expect(['npm', 'pnpm']).toContain(e.facets.packageManager)
      expect(e.facets.framework).toBe('unsupported')
    }
    const monorepos = inBucket('js-monorepo').map(
      (e) => `${e.facets.monorepo}/${e.facets.packageManager}`,
    )
    expect(monorepos.sort()).toEqual(
      ['turbo/pnpm', 'turbo/pnpm', 'nx/npm', 'workspaces/bun'].sort(),
    )
    expect(tally(inBucket('fastapi'), 'pythonManager')).toEqual({
      pip: 2,
      uv: 2,
      poetry: 1,
    })
    expect(tally(inBucket('fastapi'), 'pythonFramework')).toEqual({
      fastapi: 5,
    })
    expect(tally(inBucket('django'), 'pythonManager')).toEqual({
      pip: 1,
      poetry: 1,
      uv: 1,
    })
    expect(tally(inBucket('django'), 'pythonFramework')).toEqual({ django: 3 })
    expect(tally(inBucket('flask'), 'pythonManager')).toEqual({ pip: 2 })
    expect(tally(inBucket('python-llm'), 'pythonManager')).toEqual({
      pip: 2,
      uv: 2,
      poetry: 1,
    })
    expect(tally(inBucket('python-llm'), 'llmSdk')).toEqual({ true: 5 })
    expect(tally(inBucket('python-script'), 'pythonManager')).toEqual({
      pip: 1,
      none: 1,
    })
    expect(tally(inBucket('polyglot'), 'language')).toEqual({ polyglot: 2 })
    expect(tally(inBucket('other-language'), 'language')).toEqual({
      go: 1,
      php: 1,
      java: 1,
      rust: 1,
    })
    expect(tally(inBucket('static-html'), 'language')).toEqual({ html: 1 })
  })

  test('carries the four Supabase scenario repositories at their scenario commits', () => {
    const specs = inBucket('supabase').map((e) =>
      e.kind === 'github' ? labBenchPinSpec(e) : e.key,
    )
    for (const spec of [
      'obro79/Continuum@89857ee8d15c97571ed7411b24ef72b75754ec60',
      'obro79/stormhacks@81789291b9790159e20d62c11a3a75f8fb966fba',
      'obro79/blind-hunt@46c84f23ec6779890ba61162d6704c4ea5855bde',
      'obro79/promptetheus-service@1088e1af9859b9201a83bc2d838a9e748af2fcc6',
    ]) {
      expect(specs).toContain(spec)
      expect(LAB_BENCH.map(labBenchSpec)).toContain(spec)
    }
  })

  test('has the five fixtures', () => {
    const fixtures = LAB_BENCH_V2.filter((e) => e.kind === 'fixture')
    expect(
      fixtures.map((e) => `${e.name}:${e.git}:${e.lineEndings}`).sort(),
    ).toEqual(
      [
        'empty-folder:none:lf',
        'readme-only:commit:lf',
        'git-no-commit:init:lf',
        'windows-node:commit:crlf',
        'windows-python:commit:crlf',
      ].sort(),
    )
  })

  // evals/ is not in the public export, so the folders are checked only here.
  const root = join(import.meta.dir, '../../../evals/sponsored/bench-fixtures')
  test.skipIf(!existsSync(root))('each fixture has its folder', () => {
    for (const e of LAB_BENCH_V2)
      if (e.kind === 'fixture' && e.name !== 'empty-folder')
        expect(existsSync(join(root, e.name, 'files'))).toBe(true)
  })
})

describe('bench-v2 core', () => {
  const shape = (e: LabBenchV2Entry) => {
    const f = e.facets
    switch (e.bucket) {
      case 'nextjs':
        return `next/${f.packageManager}`
      case 'react-vite':
        return `vite/${f.packageManager}`
      case 'node-api':
        return f.language === 'javascript' && f.packageManager === 'npm'
          ? 'node/cjs-npm'
          : `node/${f.packageManager}`
      case 'js-monorepo':
        return `monorepo/${f.monorepo}/${f.packageManager}`
      case 'fastapi':
      case 'django':
      case 'flask':
        return `${e.bucket}/${f.pythonManager}`
      case 'python-llm':
        return `llm/${f.pythonManager}`
      case 'fixture':
        return e.key
      default:
        return `${e.bucket}/${f.language}`
    }
  }

  test('is the 20 decided shapes', () => {
    expect(labBenchV2Core().map(shape).sort()).toEqual(
      [
        'next/npm',
        'next/pnpm',
        'vite/bun',
        'vite/yarn',
        'node/npm',
        'node/pnpm',
        'node/cjs-npm',
        'monorepo/turbo/pnpm',
        'fastapi/pip',
        'fastapi/uv',
        'django/poetry',
        'flask/pip',
        'llm/uv',
        'llm/pip',
        'polyglot/polyglot',
        'other-language/go',
        'frontend-control/javascript',
        'fixture/empty-folder',
        'fixture/windows-node',
        'fixture/windows-python',
      ].sort(),
    )
    const express = labBenchV2Core().find((e) => shape(e) === 'node/npm')!
    expect(express.facets.language).toBe('typescript')
    const vue = labBenchV2Core().find((e) => e.bucket === 'frontend-control')!
    expect(vue.why).toMatch(/Vue/)
  })

  test("core's GitHub entries fit one Lab batch", () => {
    expect(labBenchV2Repositories(labBenchV2Core()).length).toBeLessThanOrEqual(
      LAB_BATCH_MAX_REPOSITORIES,
    )
  })

  test('entries are found by key, name or pinned spec', () => {
    const [first] = labBenchV2Repositories()
    expect(labBenchV2Entry(first!.fullName)).toBe(first!)
    expect(labBenchV2Entry(labBenchPinSpec(first!))).toBe(first!)
    expect(labBenchV2Entry('fixture/windows-node')?.kind).toBe('fixture')
    expect(labBenchV2Entry('acme/nothing')).toBeNull()
  })
})
