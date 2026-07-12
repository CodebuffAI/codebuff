import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { describe, expect, spyOn, test } from 'bun:test'

import {
  buildMetadataIndex,
  DEFAULT_GRAPH_WEIGHTS,
  resolveGraphWeights,
  updateMetadataIndex,
} from './metadata-indexer'

describe('metadata indexer', () => {
  test('builds graph nodes and content hashes', async () => {
    const root = await makeTempProject({
      'src/a.ts':
        'import { b } from "./b"\nexport function a() { return b() }\n',
      'src/b.ts': 'export function b() { return 1 }\n',
      'docs/auth.md':
        '# Authentication Flow\n\nSee [request flow](./request-flow.md).\n',
    })

    const index = await buildMetadataIndex(root)

    expect(index.version).toBe('2')
    expect(index.files['src/a.ts']?.hash).toHaveLength(64)
    expect(index.files['docs/auth.md']?.concepts).toEqual(
      expect.arrayContaining(['authentication', 'flow']),
    )
    expect(index.graph.nodes['file:src/a.ts']).toBeDefined()
    expect(index.graph.edges.some((edge) => edge.type === 'references')).toBe(
      true,
    )
    expect(index.graph.edges.some((edge) => edge.type === 'mentions')).toBe(
      true,
    )
  })

  test('uses code-map language extensions for code concepts', async () => {
    const root = await makeTempProject({
      'src/plugin.PHP': '<?php // payment gateway integration\n',
      'src/build.KTS': '// kotlin build pipeline\n',
    })

    const index = await buildMetadataIndex(root)

    expect(index.files['src/plugin.PHP']?.ext).toBe('.php')
    expect(index.files['src/plugin.PHP']?.concepts).toEqual(
      expect.arrayContaining(['payment', 'gateway', 'integration']),
    )
    expect(index.files['src/build.KTS']?.ext).toBe('.kts')
    expect(index.files['src/build.KTS']?.concepts).toEqual(
      expect.arrayContaining(['kotlin', 'build', 'pipeline']),
    )
  })

  test('uses content hash to avoid reindexing unchanged file content', async () => {
    const root = await makeTempProject({
      'src/a.ts': 'export const a = 1\n',
    })
    const first = await buildMetadataIndex(root)
    const originalHash = first.files['src/a.ts']?.hash
    const originalMtime = first.files['src/a.ts']?.mtime
    const originalSize = first.files['src/a.ts']?.size

    const future = new Date(Date.now() + 5_000)
    await fs.promises.utimes(path.join(root, 'src/a.ts'), future, future)
    const second = await updateMetadataIndex(first, root)

    expect(second.files['src/a.ts']?.hash).toBe(originalHash)
    expect(second.files['src/a.ts']?.symbols).toEqual(
      first.files['src/a.ts']?.symbols,
    )
    expect(second.files['src/a.ts']?.mtime).not.toBe(originalMtime)
    expect(second.files['src/a.ts']?.size).toBe(originalSize)
  })

  test('detects same-size same-mtime content changes by hash', async () => {
    const root = await makeTempProject({
      'docs/a.md': '# Alpha\n\nalpha topic\n',
    })
    const first = await buildMetadataIndex(root)
    const original = first.files['docs/a.md']
    expect(original).toBeDefined()
    expect(original?.headings).toContain('Alpha')
    expect(original?.concepts).toContain('alpha')

    await fs.promises.writeFile(
      path.join(root, 'docs/a.md'),
      '# Bravo\n\nbravo topic\n',
      'utf8',
    )
    await fs.promises.utimes(
      path.join(root, 'docs/a.md'),
      new Date(original!.mtime),
      new Date(original!.mtime),
    )
    const second = await updateMetadataIndex(first, root)
    const updated = second.files['docs/a.md']

    expect(updated?.size).toBe(original?.size)
    expect(Math.trunc(updated?.mtime ?? 0)).toBe(
      Math.trunc(original?.mtime ?? 0),
    )
    expect(updated?.hash).not.toBe(original?.hash)
    expect(updated?.headings).toContain('Bravo')
    expect(updated?.headings).not.toContain('Alpha')
    expect(updated?.concepts).toContain('bravo')
    expect(updated?.concepts).not.toContain('alpha')
  })

  test('drops stale metadata when a walked file cannot be read during incremental hashing', async () => {
    const root = await makeTempProject({
      'docs/a.md': '# Alpha\n\nalpha topic\n',
    })
    const targetPath = path.join(root, 'docs/a.md')
    const first = await buildMetadataIndex(root)

    expect(first.files['docs/a.md']?.headings).toContain('Alpha')

    const originalReadFile = fs.promises.readFile.bind(
      fs.promises,
    ) as typeof fs.promises.readFile
    const readFileSpy = spyOn(fs.promises, 'readFile').mockImplementation(
      (async (filePath, options) => {
        if (filePath === targetPath) {
          throw new Error('simulated read failure')
        }
        return originalReadFile(filePath, options)
      }) as typeof fs.promises.readFile,
    )

    try {
      const second = await updateMetadataIndex(first, root)

      expect(second.files['docs/a.md']).toBeUndefined()
      expect(second.graph.nodes['file:docs/a.md']).toBeUndefined()
    } finally {
      readFileSpy.mockRestore()
    }
  })

  test('drops unreadable code files without poisoning other changed code metadata', async () => {
    const root = await makeTempProject({
      'src/unreadable.ts': 'export function staleSymbol() { return 1 }\n',
      'src/live.ts': 'export function oldLiveSymbol() { return 1 }\n',
    })
    const unreadablePath = path.join(root, 'src/unreadable.ts')
    const livePath = path.join(root, 'src/live.ts')
    const first = await buildMetadataIndex(root)

    expect(first.files['src/unreadable.ts']?.symbols).toContain('staleSymbol')
    expect(first.files['src/live.ts']?.symbols).toContain('oldLiveSymbol')

    await fs.promises.writeFile(
      livePath,
      'export function freshLiveSymbol() { return 2 }\n',
      'utf8',
    )

    const originalReadFile = fs.promises.readFile.bind(
      fs.promises,
    ) as typeof fs.promises.readFile
    const readFileSpy = spyOn(fs.promises, 'readFile').mockImplementation(
      (async (filePath, options) => {
        if (filePath === unreadablePath) {
          throw new Error('simulated code read failure')
        }
        return originalReadFile(filePath, options)
      }) as typeof fs.promises.readFile,
    )

    try {
      const second = await updateMetadataIndex(first, root)

      expect(second.files['src/unreadable.ts']).toBeUndefined()
      expect(second.graph.nodes['file:src/unreadable.ts']).toBeUndefined()
      expect(second.files['src/live.ts']?.symbols).toContain('freshLiveSymbol')
      expect(second.files['src/live.ts']?.symbols).not.toContain(
        'oldLiveSymbol',
      )
    } finally {
      readFileSpy.mockRestore()
    }
  })

  test('surfaces non-fatal code parse diagnostics on the metadata index', async () => {
    const root = await makeTempProject({
      'src/unreadable.ts': 'export function unreadableSymbol() { return 1 }\n',
      'docs/readme.md': '# Readme\n',
    })
    const unreadablePath = path.join(root, 'src/unreadable.ts')
    const originalReadFile = fs.readFileSync.bind(fs) as typeof fs.readFileSync
    const readFileSyncSpy = spyOn(fs, 'readFileSync').mockImplementation(((
      filePath,
      options,
    ) => {
      if (filePath === unreadablePath) {
        throw new Error('simulated sync read failure')
      }
      return originalReadFile(filePath, options)
    }) as typeof fs.readFileSync)

    try {
      const index = await buildMetadataIndex(root)

      expect(index.files['docs/readme.md']?.headings).toContain('Readme')
      expect(index.files['src/unreadable.ts']).toBeDefined()
      expect(index.files['src/unreadable.ts']?.symbols).toEqual([])
      expect(index.parseDiagnostics).toEqual(
        expect.arrayContaining([
          {
            filePath: unreadablePath,
            stage: 'parse',
            message: 'simulated sync read failure',
          },
        ]),
      )
    } finally {
      readFileSyncSpy.mockRestore()
    }
  })

  test('indexes package scripts and CI commands as command concepts', async () => {
    const root = await makeTempProject({
      'package.json': JSON.stringify({
        scripts: {
          typecheck: 'tsc --noEmit',
          test: 'bun test',
        },
      }),
      '.github/workflows/ci.yml':
        'name: CI\nsteps:\n  - run: bun run typecheck\n  - run: bun test\n',
      Makefile: 'validate:\n\tbun run typecheck\n',
      'gulpfile.js': 'exports.build = () => run("bun run build")\n',
    })

    const index = await buildMetadataIndex(root)

    expect(index.files['package.json']?.concepts).toEqual(
      expect.arrayContaining([
        'package scripts',
        'script:typecheck=tsc --noEmit',
        'script:test=bun test',
      ]),
    )
    expect(index.files['.github/workflows/ci.yml']?.concepts).toEqual(
      expect.arrayContaining([
        'ci workflow',
        'validation suite',
        'run:- run: bun run typecheck',
      ]),
    )
    expect(index.files.Makefile?.concepts).toEqual(
      expect.arrayContaining([
        'command configuration',
        'task runner',
        'typecheck',
      ]),
    )
    expect(index.files['gulpfile.js']?.concepts).toEqual(
      expect.arrayContaining(['command configuration', 'task runner', 'build']),
    )
  })

  test('resolveGraphWeights returns historical defaults with no arg', () => {
    expect(resolveGraphWeights()).toEqual(DEFAULT_GRAPH_WEIGHTS)
    expect(resolveGraphWeights()).toEqual({
      defines: 1,
      imports: 0.7,
      references: 0.9,
      containsHeading: 0.8,
      mentions: 0.6,
      calls: 1.1,
    })
  })

  test('resolveGraphWeights overrides only the specified field', () => {
    const resolved = resolveGraphWeights({ calls: 5 })
    expect(resolved.calls).toBe(5)
    expect(resolved.defines).toBe(DEFAULT_GRAPH_WEIGHTS.defines)
    expect(resolved.imports).toBe(DEFAULT_GRAPH_WEIGHTS.imports)
    expect(resolved.references).toBe(DEFAULT_GRAPH_WEIGHTS.references)
    expect(resolved.containsHeading).toBe(DEFAULT_GRAPH_WEIGHTS.containsHeading)
    expect(resolved.mentions).toBe(DEFAULT_GRAPH_WEIGHTS.mentions)
  })

  test('buildMetadataIndex bakes custom graph edge weights into the graph', async () => {
    const root = await makeTempProject({
      'src/a.ts':
        'import { b } from "./b"\nexport function a() { return b() }\n',
      'src/b.ts': 'export function b() { return 1 }\n',
    })

    const index = await buildMetadataIndex(root, {
      weights: { graph: { defines: 5 } },
    })

    // Overridden edge type picks up the custom weight.
    const definesEdges = index.graph.edges.filter(
      (edge) => edge.type === 'defines',
    )
    expect(definesEdges.length).toBeGreaterThan(0)
    for (const edge of definesEdges) {
      expect(edge.weight).toBe(5)
    }

    // Non-overridden edge types keep their historical defaults.
    const importsEdges = index.graph.edges.filter(
      (edge) => edge.type === 'imports',
    )
    expect(importsEdges.length).toBeGreaterThan(0)
    for (const edge of importsEdges) {
      expect(edge.weight).toBe(DEFAULT_GRAPH_WEIGHTS.imports)
    }

    const referencesEdges = index.graph.edges.filter(
      (edge) => edge.type === 'references',
    )
    expect(referencesEdges.length).toBeGreaterThan(0)
    for (const edge of referencesEdges) {
      expect(edge.weight).toBe(DEFAULT_GRAPH_WEIGHTS.references)
    }
  })
})

async function makeTempProject(files: Record<string, string>): Promise<string> {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'codebuff-indexer-'),
  )
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath)
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.promises.writeFile(absolutePath, content, 'utf8')
  }
  return root
}
