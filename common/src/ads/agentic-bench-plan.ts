/**
 * The bench planner (bench-v2, B4): which cells (pool entry × OS ×
 * environment) one bench run of a skill covers, and which of them run live.
 *
 * - The STATIC oracle always covers all of the pool on three OSes: free, and
 *   it catches a route or fit mistake on the extended set.
 * - LIVE runs use `core` entries only (sweeps add `extended`), and only cells
 *   the oracle labels `should_run`, plus a few `should_refuse` and
 *   environment cells to prove the refusal and the graceful stop.
 * - Every pick is by `hash(skill.id, …)`, never by version, so successive
 *   versions of a skill hit the same cells and their receipts compare.
 *
 * Modes (Owen, 2026-10-14):
 * - `smoke` (about 1h, ≤12 Lab runs): Lab `default` on 10 stratified
 *   `should_run` core repositories plus one run per smoke environment.
 * - `full` (about 3h of Lab plus a Desktop matrix): every Lab `should_run`
 *   core cell (failures re-run, up to 3 attempts), the full environments
 *   sampled, 3 live `should_refuse` cells, and Desktop shards (Linux about 12
 *   runs, Windows ≤18, macOS ≤6; macOS only on a minor or major bump).
 * - `sweep` (weekly, and when a skill is first seeded): `full` with the
 *   extended entries live too. It never gates a PR.
 */
import {
  LAB_BATCH_MAX_REPOSITORIES,
  LAB_BATCH_MAX_RUNS,
  type LabEnvironment,
} from './agentic-ad-lab-batch'
import {
  LAB_BENCH_V2,
  LAB_BENCH_V2_VERSION,
  labBenchPinSpec,
  type LabBenchV2Entry,
} from './agentic-ad-lab-bench-v2'
import {
  BENCH_ENVIRONMENTS,
  benchDefaultEnvironment,
  type BenchEnvironment,
  type BenchOs,
  type BenchSurface,
} from './agentic-bench-env'
import {
  benchExpectation,
  type BenchExpectation,
  type BenchOracleVerdict,
} from './agentic-bench-oracle'
import { benchV2Snapshot } from './agentic-bench-v2-snapshot-data'
import { sponsoredSkillKey, sponsoredSkillSha256 } from './sponsored-skill'
import { sha256Hex } from '../util/hash'

import type { SkillBump } from './sponsored-skill-versions'
import type { SponsoredSkill } from './sponsored-skill'

export type BenchMode = 'smoke' | 'full' | 'sweep'
/** `first`: a skill with no earlier version (seeded): every surface, as a major. */
export type BenchBump = SkillBump | 'first'

export const BENCH_OSES: readonly BenchOs[] = ['linux', 'win32', 'darwin']

/** Planner constants: tunables, not env vars. */
export const BENCH_PLAN_LIMITS = {
  smokeLabRepositories: 10,
  /** Live attempts of a full-mode Lab `should_run` cell; a pass stops early. */
  fullAttempts: 3,
  fullEnvironmentCells: 2,
  fullRefusalCells: 3,
  desktop: {
    linux: { default: 8, perEnvironment: 1 },
    win32: { default: 12, perEnvironment: 1 },
    darwin: { default: 2, perEnvironment: 1 },
  },
  /** Lab chats at once: 3 batches × 3 chats each (`serverLabBatchRunner`). */
  /** Desktop runs per shard (one GitHub job): 4 × 30 min stays well inside a job's limit. */
  desktopShardEntries: 4,
  labConcurrentRuns: 9,
  labRunMinutes: 15,
  desktopRunMinutes: 30,
  /** GitHub bills macOS at 10×, Windows at 2× Linux minutes. */
  githubMinuteMultiplier: { linux: 1, win32: 2, darwin: 10 },
} as const

export type BenchCell = {
  /** `<entry>|<os>|<env>`: the same cell across versions and receipts. */
  id: string
  entry: string
  os: BenchOs
  surface: BenchSurface | 'static'
  env: string
  expected: BenchExpectation
  reason: string
  unverified: string[]
  fidelity?: string
  /** Live attempts planned; 0 for a static-only cell. */
  attempts: number
}

export type BenchLabBatchPlan = {
  environment: LabEnvironment
  /** `owner/name@<commit>`, as the skill-bench route takes them. */
  repositories: string[]
  cells: string[]
}

export type BenchDesktopShardPlan = {
  os: BenchOs
  env: string
  /** Pool keys: `owner/name` (cloned at its pin) or `fixture/<name>`. */
  entries: string[]
  cells: string[]
}

export type BenchPlan = {
  benchVersion: string
  mode: BenchMode
  bump: BenchBump
  skill: string
  skillSha256: string
  /** Every pool entry × OS, default environment, labelled by the oracle. */
  static: BenchCell[]
  live: BenchCell[]
  labBatches: BenchLabBatchPlan[]
  desktopShards: BenchDesktopShardPlan[]
  estimate: {
    labRuns: number
    desktopRuns: Record<BenchOs, number>
    labWallMinutes: number
    desktopWallMinutes: number
    githubMinutesLinuxEquivalent: number
  }
}

const cellId = (entry: string, os: BenchOs, env: string) =>
  `${entry}|${os}|${env}`

/** Deterministic order for picks: by hash of the skill id (not version) and the key. */
const byHash = <T>(
  skillId: string,
  salt: string,
  items: T[],
  key: (t: T) => string,
) =>
  [...items].sort((a, b) => {
    const ha = sha256Hex(`${skillId}|${salt}|${key(a)}`)
    const hb = sha256Hex(`${skillId}|${salt}|${key(b)}`)
    return ha < hb ? -1 : ha > hb ? 1 : 0
  })

/** The surfaces a mode and bump require (B5: patch → Lab + Windows; minor/major → all). */
export function benchSurfaces(
  mode: BenchMode,
  bump: BenchBump,
): Array<'lab' | `desktop-${BenchOs}`> {
  if (mode === 'smoke') return ['lab']
  return bump === 'patch'
    ? ['lab', 'desktop-linux', 'desktop-win32']
    : ['lab', 'desktop-linux', 'desktop-win32', 'desktop-darwin']
}

function toCell(
  entry: LabBenchV2Entry,
  os: BenchOs,
  surface: BenchCell['surface'],
  env: string,
  verdict: BenchOracleVerdict,
  attempts: number,
): BenchCell {
  return {
    id: cellId(entry.key, os, env),
    entry: entry.key,
    os,
    surface,
    env,
    expected: verdict.expected,
    reason: verdict.reason,
    unverified: verdict.unverified,
    ...(verdict.fidelity ? { fidelity: verdict.fidelity } : {}),
    attempts,
  }
}

/** Round-robin over buckets so a pick of n spans stacks, not one bucket. */
function stratified(
  skillId: string,
  entries: LabBenchV2Entry[],
  n: number,
): LabBenchV2Entry[] {
  const buckets = new Map<string, LabBenchV2Entry[]>()
  for (const entry of byHash(skillId, 'stratify', entries, (e) => e.key)) {
    const list = buckets.get(entry.bucket) ?? []
    list.push(entry)
    buckets.set(entry.bucket, list)
  }
  const order = byHash(skillId, 'buckets', [...buckets.keys()], (b) => b)
  const out: LabBenchV2Entry[] = []
  while (out.length < n && order.some((b) => buckets.get(b)!.length))
    for (const bucket of order) {
      const next = buckets.get(bucket)!.shift()
      if (next && out.length < n) out.push(next)
    }
  return out
}

export async function planBench(
  skill: SponsoredSkill,
  mode: BenchMode,
  options: { bump?: BenchBump; pool?: readonly LabBenchV2Entry[] } = {},
): Promise<BenchPlan> {
  const bump = options.bump ?? 'patch'
  const pool = options.pool ?? LAB_BENCH_V2
  const L = BENCH_PLAN_LIMITS

  const verdicts = new Map<string, BenchOracleVerdict>()
  const label = async (
    entry: LabBenchV2Entry,
    os: BenchOs,
    env: BenchEnvironment,
  ) => {
    const id = cellId(entry.key, os, env.key)
    let verdict = verdicts.get(id)
    if (!verdict) {
      verdict = await benchExpectation(
        skill,
        benchV2Snapshot(entry.key),
        os,
        env,
      )
      verdicts.set(id, verdict)
    }
    return verdict
  }

  const staticCells: BenchCell[] = []
  for (const entry of pool)
    for (const os of BENCH_OSES) {
      const env = benchDefaultEnvironment(
        os === 'linux' ? 'lab' : 'desktop',
        os,
      )
      staticCells.push(
        toCell(entry, os, 'static', 'default', await label(entry, os, env), 0),
      )
    }

  const liveTiers = mode === 'sweep' ? ['core', 'extended'] : ['core']
  const livePool = pool.filter((e) => liveTiers.includes(e.tier))
  const labPool = livePool.filter((e) => e.kind === 'github')
  const live: BenchCell[] = []
  const add = async (
    entry: LabBenchV2Entry,
    os: BenchOs,
    env: BenchEnvironment,
    attempts: number,
  ) => {
    const verdict = await label(entry, os, env)
    if (!verdict.applicable) return false
    const id = cellId(entry.key, os, env.key)
    if (live.some((c) => c.id === id)) return false
    live.push(toCell(entry, os, env.surface, env.key, verdict, attempts))
    return true
  }
  const labDefault = benchDefaultEnvironment('lab', 'linux')
  const runsOn = async (
    entry: LabBenchV2Entry,
    os: BenchOs,
    env: BenchEnvironment,
  ) => (await label(entry, os, env)).expected === 'should_run'

  // Lab, default environment.
  const labShouldRun: LabBenchV2Entry[] = []
  for (const entry of labPool)
    if (await runsOn(entry, 'linux', labDefault)) labShouldRun.push(entry)
  if (mode === 'smoke') {
    for (const entry of stratified(
      skill.id,
      labShouldRun,
      L.smokeLabRepositories,
    ))
      await add(entry, 'linux', labDefault, 1)
  } else {
    for (const entry of labShouldRun)
      await add(
        entry,
        'linux',
        labDefault,
        mode === 'full' ? L.fullAttempts : 1,
      )
  }

  // Lab environment cases, sampled where the skill runs.
  const labEnvs = BENCH_ENVIRONMENTS.filter(
    (env) =>
      env.surface === 'lab' &&
      env.key !== labDefault.key &&
      (mode === 'smoke' ? env.tier === 'smoke' : true),
  )
  const perEnv = mode === 'smoke' ? 1 : L.fullEnvironmentCells
  for (const env of labEnvs) {
    let picked = 0
    for (const entry of byHash(skill.id, env.key, labShouldRun, (e) => e.key)) {
      if (picked >= perEnv) break
      if (await add(entry, 'linux', env, 1)) picked++
    }
  }

  // Live refusals: the skill must stop itself on a repository it does not fit.
  if (mode !== 'smoke') {
    const refusing: LabBenchV2Entry[] = []
    for (const entry of labPool)
      if (
        (await label(entry, 'linux', labDefault)).expected === 'should_refuse'
      )
        refusing.push(entry)
    for (const entry of byHash(
      skill.id,
      'refuse',
      refusing,
      (e) => e.key,
    ).slice(0, L.fullRefusalCells))
      await add(entry, 'linux', labDefault, 1)
  }

  // Desktop shards.
  const surfaces = benchSurfaces(mode, bump)
  for (const os of BENCH_OSES) {
    if (!surfaces.includes(`desktop-${os}`)) continue
    const envs = BENCH_ENVIRONMENTS.filter(
      (env) => env.surface === 'desktop' && env.os === os,
    )
    const base = benchDefaultEnvironment('desktop', os)
    const shouldRun: LabBenchV2Entry[] = []
    for (const entry of livePool)
      if (await runsOn(entry, os, base)) shouldRun.push(entry)
    for (const entry of stratified(skill.id, shouldRun, L.desktop[os].default))
      await add(entry, os, base, 1)
    for (const env of envs.filter((e) => e.key !== base.key)) {
      let picked = 0
      for (const entry of byHash(skill.id, env.key, shouldRun, (e) => e.key)) {
        if (picked >= L.desktop[os].perEnvironment) break
        if (await add(entry, os, env, 1)) picked++
      }
    }
  }

  // Lab batches: one per environment, split to the Lab's caps. Each attempt
  // after the first is a re-run of that cell's failures, planned by the runner.
  const labBatches: BenchLabBatchPlan[] = []
  const byEnv = new Map<string, BenchCell[]>()
  for (const cell of live.filter((c) => c.surface === 'lab'))
    byEnv.set(cell.env, [...(byEnv.get(cell.env) ?? []), cell])
  const size = Math.min(LAB_BATCH_MAX_REPOSITORIES, LAB_BATCH_MAX_RUNS)
  for (const [envKey, cells] of byEnv) {
    const env = BENCH_ENVIRONMENTS.find((e) => e.key === envKey)!
    for (let i = 0; i < cells.length; i += size) {
      const chunk = cells.slice(i, i + size)
      labBatches.push({
        environment: env.lab!,
        repositories: chunk.map((c) => {
          const entry = pool.find((e) => e.key === c.entry)!
          if (entry.kind !== 'github')
            throw new Error(`${c.entry} is not on GitHub.`)
          return labBenchPinSpec(entry)
        }),
        cells: chunk.map((c) => c.id),
      })
    }
  }

  const desktopShards: BenchDesktopShardPlan[] = []
  for (const cell of live.filter((c) => c.surface === 'desktop')) {
    let shard = desktopShards.find(
      (s) =>
        s.os === cell.os &&
        s.env === cell.env &&
        s.entries.length < L.desktopShardEntries,
    )
    if (!shard) {
      shard = { os: cell.os, env: cell.env, entries: [], cells: [] }
      desktopShards.push(shard)
    }
    shard.entries.push(cell.entry)
    shard.cells.push(cell.id)
  }

  const labRuns = live
    .filter((c) => c.surface === 'lab')
    .reduce((n, c) => n + c.attempts, 0)
  const desktopRuns = Object.fromEntries(
    BENCH_OSES.map((os) => [
      os,
      live.filter((c) => c.surface === 'desktop' && c.os === os).length,
    ]),
  ) as Record<BenchOs, number>
  const githubMinutesLinuxEquivalent = BENCH_OSES.reduce(
    (n, os) =>
      n + desktopRuns[os] * L.desktopRunMinutes * L.githubMinuteMultiplier[os],
    0,
  )
  return {
    benchVersion: LAB_BENCH_V2_VERSION,
    mode,
    bump,
    skill: sponsoredSkillKey(skill),
    skillSha256: sponsoredSkillSha256(skill),
    static: staticCells,
    live,
    labBatches,
    desktopShards,
    estimate: {
      labRuns,
      desktopRuns,
      labWallMinutes:
        Math.ceil(labRuns / L.labConcurrentRuns) * L.labRunMinutes,
      // Shards run in parallel; the longest is one OS's shard of one env.
      desktopWallMinutes: Math.max(
        0,
        ...desktopShards.map((s) => s.entries.length * L.desktopRunMinutes),
      ),
      githubMinutesLinuxEquivalent,
    },
  }
}

/** The static labels' fingerprint, which a receipt records and CI recomputes. */
export function benchLabelsSha256(cells: readonly BenchCell[]): string {
  return sha256Hex(
    [...cells]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((c) => `${c.id}=${c.expected}`)
      .join('\n'),
  )
}
