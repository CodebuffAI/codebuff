import * as fs from 'fs'
import * as path from 'path'

import { describe, expect, test, beforeAll } from 'bun:test'

import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'

import baseDeep from '../base2/base-deep'
import { createBase2 } from '../base2/base2'

// External CLI / eval agents that live in .agents/ or evals (NOT bundled from agents/),
// but are legitimately routed. routes.json may reference these.
const EXTERNAL_ROUTE_ALLOWLIST = new Set([
  'claude-code-cli',
  'codebuff-local-cli',
  'codex-cli',
  'gemini-cli',
  'notion-query-agent',
  'notion-researcher',
  'judge-gpt',
  'judge-gemini',
  'judge-claude',
])

// Root orchestrator entry agents: never spawned by another agent, reached directly by mode selection.
const ROOT_AGENT_IDS = new Set([
  'base2',
  'base2-fast',
  'base2-fast-no-validation',
  'base2-plan',
  'base2-execute-plan',
  'base2-evals',
  'base-deep',
  'base-deep-evals',
])

// Bundled agents intentionally NOT spawnable: mechanical directory/glob work is exposed
// directly as the list_directory and glob tools rather than model-backed wrapper agents
// (see base-deep.ts spawnableAgents comment). Decision recorded under plan task M1.5.
const INTENTIONALLY_NOT_SPAWNABLE = new Set(['directory-lister', 'glob-matcher'])

// Non-orchestrator spawn edges (agents spawned by other non-root agents / patterns).
const NON_ORCHESTRATOR_SPAWN_EDGES = new Set([
  'file-lister', // spawned internally by file-picker
  'notion-query-agent', // spawned by notion-researcher (external)
])

// Agents root resolves relative to this test file (agents/__tests__/).
const agentsRoot = path.join(import.meta.dir, '..')

/**
 * Replicates the prebuild scan (cli/scripts/prebuild-agents.ts getAllTsFiles):
 * recursively collect .ts files, skipping test/type dirs and .d.ts/.test.ts files.
 */
function getAllTsFiles(dir: string): string[] {
  const files: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (
        entry.name === '__tests__' ||
        entry.name === 'node_modules' ||
        entry.name === 'types'
      ) {
        continue
      }
      files.push(...getAllTsFiles(fullPath))
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.e2e.test.ts')
    ) {
      files.push(fullPath)
    }
  }
  return files
}

// The canonical set of shipped bundled agent ids, derived from the same scan
// the prebuild uses. Populated in beforeAll because the collection is async.
const shippedIds = new Set<string>()

// Union of every id spawnable via an orchestrator/pattern spawnable set.
const reachableViaOrchestrator = new Set<string>()

beforeAll(async () => {
  for (const fullPath of getAllTsFiles(agentsRoot)) {
    try {
      const module = await import(fullPath)
      const id = module.default?.id
      if (typeof id === 'string') {
        shippedIds.add(id)
      }
    } catch {
      // Match prebuild's tolerant behavior: an unrelated non-agent .ts file
      // that throws on import must not break the guard.
    }
  }

  const orchestratorSpawnableLists = [
    createBase2('default').spawnableAgents,
    createBase2('default', { planOnly: true }).spawnableAgents,
    createBase2('default', { executePlan: true }).spawnableAgents,
    createBase2('fast').spawnableAgents,
    baseDeep.spawnableAgents,
  ]
  for (const list of orchestratorSpawnableLists) {
    for (const id of list ?? []) {
      reachableViaOrchestrator.add(id)
    }
  }
})

describe('roster drift guard', () => {
  test('routes.json references only shipped or allowlisted agents', () => {
    const routesPath = path.join(
      agentsRoot,
      '..',
      'openbuff.d.example/routes.json',
    )
    const parsed = JSON.parse(fs.readFileSync(routesPath, 'utf-8'))
    const routeAgentIds = Object.keys(parsed.agents)
    const offenders = routeAgentIds.filter(
      (id) => !shippedIds.has(id) && !EXTERNAL_ROUTE_ALLOWLIST.has(id),
    )
    expect(offenders).toEqual([])
  })

  test('AGENT_PERSONAS references only shipped agents', () => {
    const personaIds = Object.keys(AGENT_PERSONAS)
    const offenders = personaIds.filter((id) => !shippedIds.has(id))
    expect(offenders).toEqual([])
  })

  test('orchestrator spawnable lists reference only shipped agents', () => {
    const offenders = Array.from(reachableViaOrchestrator).filter(
      (id) => !shippedIds.has(id),
    )
    expect(offenders).toEqual([])
  })

  test('every shipped non-root agent is reachable or intentionally excluded', () => {
    const offenders = Array.from(shippedIds).filter(
      (id) =>
        !ROOT_AGENT_IDS.has(id) &&
        !reachableViaOrchestrator.has(id) &&
        !NON_ORCHESTRATOR_SPAWN_EDGES.has(id) &&
        !INTENTIONALLY_NOT_SPAWNABLE.has(id),
    )
    expect(offenders).toEqual([])
  })
})

// M3.2 — the base2-fast spawnable set must match the other modes except for
// the documented, intentional per-mode deltas coded in base2.ts. This freezes
// those deltas so an accidental gate change (e.g. gating browser-use by mode,
// or leaving thinker/editor in fast) is caught here rather than silently
// drifting the fast roster away from default.
describe('intentional per-mode spawnable deltas (M3.2)', () => {
  const defaultSet = new Set(
    (createBase2('default').spawnableAgents ?? []) as string[],
  )
  const fastSet = new Set((createBase2('fast').spawnableAgents ?? []) as string[])
  const planSet = new Set(
    (createBase2('default', { planOnly: true }).spawnableAgents ?? []) as string[],
  )

  // The ONLY agents default mode has that fast mode does not. Fast implements
  // inline via edit_transaction instead of delegating to the editor family,
  // and skips the thinker for speed.
  const DEFAULT_ONLY_VS_FAST = new Set(['thinker', 'editor', 'repair-editor'])

  // Implementation-only agents withheld from read-only plan mode (`!planOnly`).
  const IMPLEMENTATION_ONLY_VS_PLAN = new Set([
    'dependency-manager',
    'editor',
    'repair-editor',
    'tmux-cli',
    'git-committer',
    'doc-writer',
    'test-writer',
  ])

  test('browser-use is unconditional across every mode', () => {
    expect(defaultSet.has('browser-use')).toBe(true)
    expect(fastSet.has('browser-use')).toBe(true)
    expect(planSet.has('browser-use')).toBe(true)
  })

  test('fast differs from default only by the documented default-only agents', () => {
    const defaultOnly = Array.from(defaultSet).filter((id) => !fastSet.has(id))
    expect(new Set(defaultOnly)).toEqual(DEFAULT_ONLY_VS_FAST)
    // fast never has an agent that default lacks.
    const fastOnly = Array.from(fastSet).filter((id) => !defaultSet.has(id))
    expect(fastOnly).toEqual([])
  })

  test('plan differs from default only by the documented implementation-only agents', () => {
    const defaultOnly = Array.from(defaultSet).filter((id) => !planSet.has(id))
    expect(new Set(defaultOnly)).toEqual(IMPLEMENTATION_ONLY_VS_PLAN)
    // plan never has an agent that default lacks.
    const planOnly = Array.from(planSet).filter((id) => !defaultSet.has(id))
    expect(planOnly).toEqual([])
  })
})
