/**
 * build-structural-map.ts
 *
 * Builds a one-shot structural map of the codebase (MAP.md) for use by the
 * audit-codebase pattern and any other task that needs a pinned structural
 * overview without re-discovering it via round-trips.
 *
 * The map is intentionally a plain Markdown file so an agent can `read_files`
 * it once and pin it in context. It contains:
 *   - Project metadata (root, file count, built-at)
 *   - Per-top-level-directory summaries (file count, total bytes, top files
 *     by size, top symbols)
 *   - Entry points (files matching index.ts/main.ts/cli.ts/server entrypoints)
 *   - High-degree graph nodes (most-imported files = likely key modules)
 *   - Cross-directory import edges (shows architectural layering)
 *
 * Usage:
 *   bun run scripts/build-structural-map.ts [--out <path>] [--root <path>]
 *
 * Defaults:
 *   --root  process.cwd()
 *   --out   .agents/sessions/structural-map.md  (or ./MAP.md if no .agents)
 *
 * The script reads the indexer's MetadataIndex (building it if stale) and
 * renders the map. It does NOT modify the index.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

import { IndexManager, loadIndex } from '@codebuff/indexer'
import type { IndexedFile, MetadataIndex } from '@codebuff/indexer'

interface CliArgs {
  root: string
  out: string
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    root: process.cwd(),
    out: '',
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root' && argv[i + 1]) {
      args.root = path.resolve(argv[++i])
    } else if (a === '--out' && argv[i + 1]) {
      args.out = path.resolve(argv[++i])
    } else if (a === '-h' || a === '--help') {
      process.stdout.write(
        [
          'Usage: bun run scripts/build-structural-map.ts [--out <path>] [--root <path>]',
          '',
          'Builds a Markdown structural map of the codebase for audit/overview use.',
          '',
          'Options:',
          '  --root <path>   Project root to index (default: cwd)',
          '  --out <path>    Output MAP.md path (default: .agents/sessions/structural-map.md or ./MAP.md)',
          '',
        ].join('\n') + '\n',
      )
      process.exit(0)
    }
  }
  if (!args.out) {
    const agentsSessionsDir = path.join(args.root, '.agents', 'sessions')
    if (fs.existsSync(agentsSessionsDir)) {
      args.out = path.join(agentsSessionsDir, 'structural-map.md')
    } else {
      args.out = path.join(args.root, 'MAP.md')
    }
  }
  return args
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const ENTRY_POINT_PATTERNS = [
  /^src\/index\.[tj]sx?$/,
  /^src\/main\.[tj]sx?$/,
  /^src\/cli\.[tj]sx?$/,
  /^src\/server\.[tj]sx?$/,
  /^src\/app\.[tj]sx?$/,
  /^cli\/src\/index\.[tj]sx?$/,
  /^packages\/[^/]+\/src\/index\.[tj]sx?$/,
  /^index\.[tj]sx?$/,
  /^main\.[tj]sx?$/,
]

function isEntryPoint(relPath: string): boolean {
  return ENTRY_POINT_PATTERNS.some((re) => re.test(relPath))
}

function topLevelDir(relPath: string): string {
  const idx = relPath.indexOf('/')
  return idx === -1 ? relPath : relPath.slice(0, idx)
}

interface DirSummary {
  dir: string
  fileCount: number
  totalBytes: number
  topFiles: Array<{ path: string; size: number; symbols: number }>
  topSymbols: string[]
}

function summarizeByDir(
  files: Record<string, IndexedFile>,
): Map<string, DirSummary> {
  const byDir = new Map<string, DirSummary>()
  for (const [relPath, info] of Object.entries(files)) {
    const dir = topLevelDir(relPath)
    let summary = byDir.get(dir)
    if (!summary) {
      summary = {
        dir,
        fileCount: 0,
        totalBytes: 0,
        topFiles: [],
        topSymbols: [],
      }
      byDir.set(dir, summary)
    }
    summary.fileCount++
    summary.totalBytes += info.size
    summary.topFiles.push({
      path: relPath,
      size: info.size,
      symbols: info.symbols.length,
    })
    summary.topSymbols.push(...info.symbols)
  }
  // Keep top 5 files per dir by size; top 20 symbols by frequency.
  for (const summary of byDir.values()) {
    summary.topFiles.sort((a, b) => b.size - a.size).splice(5)
    const symbolFreq = new Map<string, number>()
    for (const s of summary.topSymbols) {
      symbolFreq.set(s, (symbolFreq.get(s) ?? 0) + 1)
    }
    summary.topSymbols = [...symbolFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([s]) => s)
  }
  // Sort dirs by total bytes desc so the biggest (most worth auditing) come first.
  return new Map(
    [...byDir.entries()].sort((a, b) => b[1].totalBytes - a[1].totalBytes),
  )
}

interface GraphStats {
  mostImportedFiles: Array<{ path: string; inDegree: number }>
  crossDirEdges: Array<{ from: string; to: string; count: number }>
}

function computeGraphStats(index: MetadataIndex): GraphStats {
  const inDegree = new Map<string, number>()
  const crossDir = new Map<string, { from: string; to: string; count: number }>()

  for (const edge of index.graph.edges) {
    if (edge.type !== 'imports' && edge.type !== 'calls') continue
    const fromNode = index.graph.nodes[edge.from]
    const toNode = index.graph.nodes[edge.to]
    if (!fromNode?.path || !toNode?.path) continue
    const toPath = toNode.path
    inDegree.set(toPath, (inDegree.get(toPath) ?? 0) + 1)

    const fromDir = topLevelDir(fromNode.path)
    const toDir = topLevelDir(toNode.path)
    if (fromDir !== toDir) {
      const key = `${fromDir}->${toDir}`
      let entry = crossDir.get(key)
      if (!entry) {
        entry = { from: fromDir, to: toDir, count: 0 }
        crossDir.set(key, entry)
      }
      entry.count++
    }
  }

  const mostImportedFiles = [...inDegree.entries()]
    .map(([p, deg]) => ({ path: p, inDegree: deg }))
    .sort((a, b) => b.inDegree - a.inDegree)
    .slice(0, 25)

  const crossDirEdges = [...crossDir.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 30)

  return { mostImportedFiles, crossDirEdges }
}

function renderMap(index: MetadataIndex, root: string): string {
  const lines: string[] = []
  const builtAt = new Date(index.builtAt).toISOString()
  const byDir = summarizeByDir(index.files)
  const { mostImportedFiles, crossDirEdges } = computeGraphStats(index)
  const entryPoints = Object.keys(index.files)
    .filter(isEntryPoint)
    .sort()

  lines.push(`# Structural Map — ${path.basename(root)}`)
  lines.push('')
  lines.push(`- **Project root:** \`${root}\``)
  lines.push(`- **Built at:** ${builtAt}`)
  lines.push(`- **Total files indexed:** ${index.fileCount}`)
  lines.push(
    `- **Graph:** ${Object.keys(index.graph.nodes).length} nodes, ${index.graph.edges.length} edges`,
  )
  lines.push('')
  lines.push('> Pin this file in context. Every audit shard navigates from here instead of doing fuzzy round-trip discovery.')
  lines.push('')

  // Entry points
  lines.push('## Entry points')
  if (entryPoints.length === 0) {
    lines.push('_(none detected by heuristic patterns)_')
  } else {
    for (const p of entryPoints) {
      lines.push(`- \`${p}\``)
    }
  }
  lines.push('')

  // Per-directory summary
  lines.push('## Directories (by size, biggest first)')
  lines.push('')
  lines.push('| dir | files | total size | top symbols |')
  lines.push('| --- | --- | --- | --- |')
  for (const s of byDir.values()) {
    const sym = s.topSymbols.slice(0, 6).join(', ') || '—'
    lines.push(
      `| \`${s.dir}\` | ${s.fileCount} | ${formatBytes(s.totalBytes)} | ${sym} |`,
    )
  }
  lines.push('')

  // Top files per dir (details)
  lines.push('## Largest files per directory')
  lines.push('')
  for (const s of byDir.values()) {
    if (s.topFiles.length === 0) continue
    lines.push(`### \`${s.dir}\``)
    for (const f of s.topFiles) {
      lines.push(
        `- \`${f.path}\` — ${formatBytes(f.size)}, ${f.symbols} symbols`,
      )
    }
    lines.push('')
  }

  // Most-imported files (key modules)
  lines.push('## Most-imported files (likely key modules)')
  lines.push('')
  if (mostImportedFiles.length === 0) {
    lines.push('_(no import/call edges in index)_')
  } else {
    lines.push('| in-degree | file |')
    lines.push('| --- | --- |')
    for (const m of mostImportedFiles) {
      lines.push(`| ${m.inDegree} | \`${m.path}\` |`)
    }
  }
  lines.push('')

  // Cross-directory edges (architectural layering)
  lines.push('## Cross-directory dependencies (architectural layering)')
  lines.push('')
  if (crossDirEdges.length === 0) {
    lines.push('_(no cross-directory edges in index)_')
  } else {
    lines.push('| count | from → to |')
    lines.push('| --- | --- |')
    for (const e of crossDirEdges) {
      lines.push(`| ${e.count} | \`${e.from}\` → \`${e.to}\` |`)
    }
  }
  lines.push('')

  // Shard-sizing hint
  const totalBytes = [...byDir.values()].reduce(
    (acc, s) => acc + s.totalBytes,
    0,
  )
  lines.push('## Shard sizing hint')
  lines.push('')
  lines.push(
    `Total indexed source: **${formatBytes(totalBytes)}** across **${byDir.size}** top-level directories.`,
  )
  lines.push('')
  lines.push('When sharding for an audit, aim for ~5–15 files per shard. Use the table above to group small dirs together and split huge dirs (e.g. split `src/` by subdirectory).')
  lines.push('')

  return lines.join('\n')
}

async function main(): Promise<void> {
  const { root, out } = parseArgs(process.argv)

  const manager = IndexManager.getInstance(root, {})
  process.stderr.write('Building/loading codebase index...\n')
  manager.ensureBuilt()
  await manager.waitUntilReady()
  // The manager exposes search via query(); for the raw MetadataIndex we read
  // the cached index file directly through the index-store loader, which the
  // manager just finished writing via saveIndex() during _build().
  const index = await loadIndex(root)
  if (!index) {
    throw new Error(
      'Index not found after build. Ensure the indexer ran successfully (check .codebuff-index/metadata.json).',
    )
  }

  process.stderr.write(`Rendering map from ${index.fileCount} files...\n`)
  const map = renderMap(index, root)

  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, map, 'utf8')
  process.stderr.write(`Structural map written to: ${out}\n`)
}

main().catch((err) => {
  console.error('Failed to build structural map:', err)
  process.exit(1)
})
