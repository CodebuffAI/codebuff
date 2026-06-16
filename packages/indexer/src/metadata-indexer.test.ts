import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { describe, expect, test } from 'bun:test'

import { buildMetadataIndex, updateMetadataIndex } from './metadata-indexer'

describe('metadata indexer', () => {
  test('builds graph nodes and content hashes', async () => {
    const root = await makeTempProject({
      'src/a.ts': 'import { b } from "./b"\nexport function a() { return b() }\n',
      'src/b.ts': 'export function b() { return 1 }\n',
      'docs/auth.md': '# Authentication Flow\n\nSee [request flow](./request-flow.md).\n',
    })

    const index = await buildMetadataIndex(root)

    expect(index.version).toBe('2')
    expect(index.files['src/a.ts']?.hash).toHaveLength(64)
    expect(index.files['docs/auth.md']?.concepts).toEqual(
      expect.arrayContaining(['authentication', 'flow']),
    )
    expect(index.graph.nodes['file:src/a.ts']).toBeDefined()
    expect(index.graph.edges.some((edge) => edge.type === 'references')).toBe(true)
    expect(index.graph.edges.some((edge) => edge.type === 'mentions')).toBe(true)
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
    expect(second.files['src/a.ts']?.symbols).toEqual(first.files['src/a.ts']?.symbols)
    expect(second.files['src/a.ts']?.mtime).not.toBe(originalMtime)
    expect(second.files['src/a.ts']?.size).toBe(originalSize)
  })

  test('indexes package scripts and CI commands as command concepts', async () => {
    const root = await makeTempProject({
      'package.json': JSON.stringify({
        scripts: {
          typecheck: 'tsc --noEmit',
          test: 'bun test',
        },
      }),
      '.github/workflows/ci.yml': 'name: CI\nsteps:\n  - run: bun run typecheck\n  - run: bun test\n',
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
      expect.arrayContaining(['ci workflow', 'validation suite', 'run:- run: bun run typecheck']),
    )
    expect(index.files.Makefile?.concepts).toEqual(
      expect.arrayContaining(['command configuration', 'task runner', 'typecheck']),
    )
    expect(index.files['gulpfile.js']?.concepts).toEqual(
      expect.arrayContaining(['command configuration', 'task runner', 'build']),
    )
  })
})

async function makeTempProject(files: Record<string, string>): Promise<string> {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codebuff-indexer-'))
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath)
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.promises.writeFile(absolutePath, content, 'utf8')
  }
  return root
}
