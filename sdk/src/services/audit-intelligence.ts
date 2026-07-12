import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const ignored = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next'])
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.cs', '.cpp', '.c', '.rb', '.php', '.swift', '.kt', '.gd'])
const testPattern = /(?:^|\/)(?:__tests__|tests?|spec)(?:\/|$)|\.(?:test|spec)\.[^.]+$/i
const docPattern = /(?:^|\/)(?:README|CHANGELOG|ROADMAP|docs?\/)/i
const generatedPattern = /(?:\.generated\.|\/generated\/|\/dist\/|\/build\/)/i

export type CodebaseInventory = {
  schemaVersion: 1
  snapshotId: string
  root: string
  subsystems: Array<{ id: string; files: number; sourceFiles: number; tests: number; docs: number }>
  entrypoints: string[]
  manifests: string[]
  routes: string[]
  commands: string[]
  publicApis: string[]
  tests: string[]
  generatedFiles: string[]
  capabilityPacket: { languages: string[]; frameworks: string[] }
  uncoveredDirectories: string[]
}

function walk(root: string, current = root, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue
    const absolute = path.join(current, entry.name)
    if (entry.isDirectory()) walk(root, absolute, out)
    else if (entry.isFile()) out.push(path.relative(root, absolute).replace(/\\/g, '/'))
  }
  return out
}

function hashInventory(files: string[], root: string): string {
  const hash = createHash('sha256')
  for (const file of files) {
    const stat = fs.statSync(path.join(root, file))
    hash.update(`${file}\0${stat.size}\0${stat.mtimeMs}\n`)
  }
  return hash.digest('hex')
}

export function inspectCodebaseStructure(cwd: string, scope?: string[]): CodebaseInventory {
  const root = path.resolve(cwd)
  const allFiles = walk(root).sort()
  const files = scope?.length
    ? allFiles.filter((file) => scope.some((prefix) => file === prefix || file.startsWith(`${prefix.replace(/\/$/, '')}/`)))
    : allFiles
  const subsystemMap = new Map<string, string[]>()
  for (const file of files) {
    const id = file.includes('/') ? file.split('/')[0]! : '.'
    subsystemMap.set(id, [...(subsystemMap.get(id) ?? []), file])
  }
  const manifests = files.filter((file) => /(^|\/)(package\.json|Cargo\.toml|pyproject\.toml|go\.mod|pom\.xml|build\.gradle(?:\.kts)?|Package\.swift|project\.godot)$/.test(file))
  const tests = files.filter((file) => testPattern.test(file))
  const entrypoints = files.filter((file) => /(^|\/)(index|main|app|server|cli)\.[^.]+$/i.test(file))
  const routes = files.filter((file) => /(^|\/)(routes?|pages?|app)\//i.test(file) || /route\.[^.]+$/i.test(file))
  const commands = files.filter((file) => /(^|\/)(commands?|scripts)\//i.test(file))
  const publicApis = files.filter((file) => /(^|\/)(index|mod|lib)\.[^.]+$/i.test(file) || /(^|\/)exports?\.[^.]+$/i.test(file))
  const generatedFiles = files.filter((file) => generatedPattern.test(file))
  const extensionLanguages: Record<string, string> = { '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript', '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java', '.cs': 'csharp', '.cpp': 'cpp', '.c': 'c', '.rb': 'ruby', '.php': 'php', '.swift': 'swift', '.kt': 'kotlin', '.gd': 'gdscript' }
  const languages = [...new Set(files.map((file) => extensionLanguages[path.extname(file).toLowerCase()]).filter((value): value is string => Boolean(value)))]
  const frameworkSignals: Array<[RegExp, string]> = [[/(^|\/)next\.config\./, 'nextjs'], [/(^|\/)vite\.config\./, 'vite'], [/(^|\/)angular\.json$/, 'angular'], [/(^|\/)svelte\.config\./, 'svelte'], [/(^|\/)Cargo\.toml$/, 'cargo'], [/(^|\/)go\.mod$/, 'go-modules'], [/(^|\/)pyproject\.toml$/, 'python-packaging'], [/(^|\/)project\.godot$/, 'godot']]
  const frameworks = frameworkSignals.filter(([pattern]) => files.some((file) => pattern.test(file))).map(([, id]) => id)
  return {
    schemaVersion: 1,
    snapshotId: hashInventory(files, root),
    root,
    subsystems: [...subsystemMap].map(([id, owned]) => ({
      id,
      files: owned.length,
      sourceFiles: owned.filter((file) => sourceExtensions.has(path.extname(file).toLowerCase())).length,
      tests: owned.filter((file) => testPattern.test(file)).length,
      docs: owned.filter((file) => docPattern.test(file)).length,
    })),
    entrypoints,
    manifests,
    routes,
    commands,
    publicApis,
    tests,
    generatedFiles,
    capabilityPacket: { languages, frameworks },
    uncoveredDirectories: [],
  }
}

export type FeatureCompletenessRecord = {
  feature: string
  evidence: { entrypoints: string[]; implementation: string[]; consumers: string[]; tests: string[]; docs: string[]; failureStates: string[] }
  status: 'complete' | 'partial' | 'implemented_but_unreachable' | 'documented_but_unimplemented' | 'tested_without_runtime_wiring' | 'runtime_wired_without_failure_coverage' | 'unknown'
  missing: string[]
}

export function inspectFeatureCompleteness(cwd: string, feature: string, inventory: CodebaseInventory): FeatureCompletenessRecord {
  const terms = feature.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length >= 3)
  const candidates = [...new Set([...inventory.entrypoints, ...inventory.routes, ...inventory.commands, ...inventory.publicApis, ...inventory.tests, ...walk(path.resolve(cwd)).filter((file) => docPattern.test(file))])]
  const matching = candidates.filter((file) => {
    const haystack = `${file}\n${safeRead(path.join(cwd, file))}`.toLowerCase()
    return terms.some((term) => haystack.includes(term))
  })
  const evidence = {
    entrypoints: matching.filter((file) => inventory.entrypoints.includes(file) || inventory.commands.includes(file) || inventory.routes.includes(file)),
    implementation: matching.filter((file) => sourceExtensions.has(path.extname(file).toLowerCase()) && !testPattern.test(file)),
    consumers: matching.filter((file) => /(?:cli|ui|components?|pages?|routes?|sdk)\//i.test(file)),
    tests: matching.filter((file) => testPattern.test(file)),
    docs: matching.filter((file) => docPattern.test(file)),
    failureStates: matching.filter((file) => /error|retry|cancel|timeout|empty|loading|permission/i.test(safeRead(path.join(cwd, file)))),
  }
  const missing = Object.entries(evidence).filter(([, value]) => value.length === 0).map(([key]) => key)
  let status: FeatureCompletenessRecord['status'] = missing.length === 0 ? 'complete' : 'partial'
  if (!evidence.implementation.length && evidence.docs.length) status = 'documented_but_unimplemented'
  else if (evidence.implementation.length && !evidence.entrypoints.length && !evidence.consumers.length) status = 'implemented_but_unreachable'
  else if (evidence.tests.length && !evidence.entrypoints.length) status = 'tested_without_runtime_wiring'
  else if (evidence.entrypoints.length && !evidence.failureStates.length) status = 'runtime_wired_without_failure_coverage'
  else if (matching.length === 0) status = 'unknown'
  return { feature, evidence, status, missing }
}

function safeRead(file: string): string {
  try { return fs.statSync(file).size <= 256_000 ? fs.readFileSync(file, 'utf8') : '' } catch { return '' }
}

export function evaluateAuditCoverage(params: { inventory: CodebaseInventory; structuralReceipts: string[]; featureRecords: FeatureCompletenessRecord[]; outOfScope?: Array<{ id: string; reason: string }> }) {
  const receipts = new Set(params.structuralReceipts)
  const exclusions = new Map((params.outOfScope ?? []).map((item) => [item.id, item.reason]))
  const uncoveredSubsystems = params.inventory.subsystems.map((item) => item.id).filter((id) => !receipts.has(id) && !exclusions.has(id))
  const incompleteFeatures = params.featureRecords.filter((item) => item.status !== 'complete')
  return {
    schemaVersion: 1 as const,
    snapshotId: params.inventory.snapshotId,
    complete: uncoveredSubsystems.length === 0 && incompleteFeatures.length === 0,
    uncoveredSubsystems,
    incompleteFeatures: incompleteFeatures.map((item) => ({ feature: item.feature, status: item.status, missing: item.missing })),
    outOfScope: [...exclusions].map(([id, reason]) => ({ id, reason })),
  }
}
