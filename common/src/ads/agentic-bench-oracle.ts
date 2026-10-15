/**
 * The bench's static oracle (bench-v2, B2): what a skill SHOULD do on one
 * bench cell (repository snapshot × OS × environment), decided with no run:
 *
 * - `should_refuse`: the skill's own preflight refuses the repository (or
 *   the OS) before any edit. The real `runSponsoredSkillPreflight` decides
 *   it over a static context of the snapshot, and Track A's fit oracle
 *   (`sponsoredSkillFitRefusal` over `sponsoredRepoFacts`) must agree.
 * - `should_fail_gracefully`: the skill fits, but the environment takes away
 *   a toolchain the run needs (`BenchEnvironment.hides`), so the run should
 *   stop cleanly, not crash or report a delivery.
 * - `should_run`: neither; the run should deliver.
 *
 * Checks it cannot decide statically (commands, scripts, globs over source
 * files, lockfile text it does not keep) are `unverified`, never a refusal:
 * the live run decides them. Free and deterministic, so it covers the whole
 * pool on three OSes on every bench run.
 */
import {
  BENCH_HEALED_TOOLCHAINS,
  type BenchEnvironment,
  type BenchOs,
  type BenchToolchain,
} from './agentic-bench-env'
import {
  benchSnapshotForOs,
  type BenchSnapshot,
} from './agentic-bench-snapshot'
import {
  evaluateSponsoredSkillFit,
  sponsoredFitCheckDecidable,
  sponsoredRepoFacts,
  sponsoredStaticCheckContext,
  type SponsoredRepoFacts,
  type SponsoredSkillFitVerdict,
} from './sponsored-skill-fit'
import {
  sponsoredSkillFitEcosystems,
  sponsoredSkillGlob,
  sponsoredSkillPreflightChecks,
  type SponsoredSkill,
  type SponsoredSkillCheck,
} from './sponsored-skill'
import {
  runSponsoredSkillPreflight,
  SPONSORED_PREFLIGHT_OS_CHECK_ID,
} from './sponsored-step-driver'

export type BenchExpectation =
  | 'should_run'
  | 'should_refuse'
  | 'should_fail_gracefully'

export type BenchOracleVerdict = {
  expected: BenchExpectation
  /**
   * False when the environment cannot be set up on this repository (the
   * collision case needs a root package.json): the planner never runs it.
   */
  applicable: boolean
  /** One line: the refusing check, the hidden toolchain, or `fits`. */
  reason: string
  /** The fit oracle's verdict on the same facts. */
  fit: SponsoredSkillFitVerdict['fit']
  /** Preflight checks the snapshot cannot decide; the live run decides them. */
  unverified: string[]
  /**
   * The fit oracle and the real preflight disagree on a check both can
   * decide: a bug in one of them. The label follows the real preflight.
   */
  fidelity?: string
}

/** The toolchains a run of `skill` on this repository needs. */
export function benchRunToolchains(
  skill: SponsoredSkill,
  facts: SponsoredRepoFacts,
): BenchToolchain[] {
  const hasNode = facts.manifests.some((m) => m.ecosystem === 'npm')
  const hasPython = facts.manifests.some((m) => m.ecosystem === 'pypi')
  const routes = sponsoredSkillFitEcosystems(skill) ?? [
    ...new Set(
      skill.requirements.runtimes.map((r) =>
        r.name === 'python' ? 'python' : 'node',
      ),
    ),
  ]
  // The route this repository takes: the first the skill offers that the
  // repository has a manifest for, else the skill's first.
  const route =
    routes.find((r) => (r === 'node' ? hasNode : hasPython)) ?? routes[0]
  const needs = new Set<BenchToolchain>()
  if (route === 'node') needs.add('node')
  if (route === 'python') {
    needs.add('python')
    if (skill.packages.some((p) => p.ecosystem === 'pypi')) needs.add('pip')
  }
  // An npm tool needs Node only where a check runs it; instructions that use
  // it "when npx is available" do not make Node a requirement.
  const npmTools = new Set(
    skill.tools.filter((t) => t.source === 'npm').map((t) => t.name),
  )
  const checks = [
    ...sponsoredSkillPreflightChecks(skill),
    ...skill.steps.flatMap((step) => step.checks),
  ]
  if (
    checks.some(
      (check) =>
        check.kind === 'command_succeeds' &&
        (npmTools.has(check.argv[0] ?? '') ||
          ['node', 'npm', 'npx'].includes(check.argv[0] ?? '')),
    )
  )
    needs.add('node')
  return [...needs]
}

const contentless = (snapshot: BenchSnapshot) =>
  Object.entries(snapshot.files)
    .filter(([, text]) => text === null)
    .map(([path]) => path)

/** Whether the snapshot can decide this check at all. */
function staticallyDecidable(
  check: SponsoredSkillCheck,
  snapshot: BenchSnapshot,
): boolean {
  if (!sponsoredFitCheckDecidable(check)) return false
  if (check.kind === 'file_contains') {
    const re = sponsoredSkillGlob(check.path)
    if (contentless(snapshot).some((path) => re.test(path))) return false
  }
  return true
}

export async function benchRepoFacts(
  snapshot: BenchSnapshot,
): Promise<SponsoredRepoFacts> {
  return sponsoredRepoFacts({
    paths: Object.keys(snapshot.files),
    complete: snapshot.complete,
    read: (path) => snapshot.files[path] ?? null,
  })
}

/** THE label of one bench cell. */
export async function benchExpectation(
  skill: SponsoredSkill,
  snapshot: BenchSnapshot,
  os: BenchOs,
  env: Pick<BenchEnvironment, 'hides' | 'needsRootPackageJson'>,
): Promise<BenchOracleVerdict> {
  const onOs = benchSnapshotForOs(snapshot, os)
  const facts = await benchRepoFacts(onOs)
  const fit = evaluateSponsoredSkillFit(skill, { os, repo: facts })
  const applicable = !env.needsRootPackageJson || 'package.json' in onOs.files

  const files = Object.fromEntries(
    Object.entries(onOs.files).map(([path, text]) => [path, text ?? '']),
  )
  const preflight = await runSponsoredSkillPreflight({
    skill,
    ctx: sponsoredStaticCheckContext(files),
    platform: os,
  })
  const declared = new Map(
    sponsoredSkillPreflightChecks(skill).map((check) => [check.id, check]),
  )
  const unverified: string[] = []
  const refused: string[] = []
  for (const result of preflight.checks) {
    if (result.status !== 'fail') continue
    if (result.id === SPONSORED_PREFLIGHT_OS_CHECK_ID) {
      refused.push(result.id)
      continue
    }
    const check = declared.get(result.id)
    if (check && staticallyDecidable(check, onOs)) refused.push(result.id)
    else unverified.push(result.id)
  }
  // A check the static run did not fail can still be one it could not
  // decide (a command it never ran because an earlier check failed).
  for (const check of declared.values())
    if (
      !staticallyDecidable(check, onOs) &&
      !unverified.includes(check.id) &&
      !refused.includes(check.id) &&
      check.kind !== 'no_privileged_secrets' &&
      check.kind !== 'changes_within'
    )
      unverified.push(check.id)

  let fidelity: string | undefined
  if (fit.fit === 'misfit' && !refused.length)
    fidelity = `the fit oracle refuses on ${fit.checkId} (${fit.reason}) but the real preflight passes every check it can decide`
  if (fit.fit === 'fits' && refused.length)
    fidelity = `the fit oracle says fits but the real preflight refuses on ${refused.join(', ')}`

  const base = {
    applicable,
    fit: fit.fit,
    unverified,
    ...(fidelity ? { fidelity } : {}),
  }
  if (refused.length)
    return {
      ...base,
      expected: 'should_refuse',
      reason: `preflight refuses: ${refused.join(', ')}`,
    }
  const missing = benchRunToolchains(skill, facts).filter(
    (tool) =>
      env.hides.includes(tool) && !BENCH_HEALED_TOOLCHAINS.includes(tool),
  )
  if (missing.length)
    return {
      ...base,
      expected: 'should_fail_gracefully',
      reason: `the environment has no ${missing.join(' or ')}`,
    }
  return { ...base, expected: 'should_run', reason: 'fits' }
}

/** What one live run of a cell did, from a Lab grade or a Desktop leg's result. */
export type BenchRunOutcome = {
  tier: 'perfect' | 'handoff' | 'partial' | 'broken' | 'lost' | null
  causeKey: string | null
  /** The step driver's stop reason when known (`preflight_failed`, …). */
  stoppedBecause?: string | null
  /** The run never tested the skill: no grade, a failed setup, an infra cause. */
  infra?: boolean
}

/** Grader causes that mean the run stopped at the skill's own refusal. */
export const BENCH_REFUSAL_CAUSES: readonly string[] = [
  'preflight_refused',
  'not_a_fit',
  'platform_unsupported',
]

/** Grader causes that mean a clean stop for a missing toolchain. */
export const BENCH_GRACEFUL_CAUSES: readonly string[] = [
  ...BENCH_REFUSAL_CAUSES,
  'missing_node',
  'missing_toolchain',
  'environment_limited',
]

export type BenchCellResult = 'pass' | 'fail' | 'mismatch' | 'infra'

/**
 * THE pass predicate of one live run against its label. A run that did
 * the opposite of its label (delivered where it should refuse, refused
 * where it should run) is a `mismatch`, always red.
 */
export function benchCellPass(
  expected: BenchExpectation,
  outcome: BenchRunOutcome,
): BenchCellResult {
  if (outcome.infra || !outcome.tier) return 'infra'
  const refused =
    outcome.stoppedBecause === 'preflight_failed' ||
    BENCH_REFUSAL_CAUSES.includes(outcome.causeKey ?? '')
  switch (expected) {
    case 'should_run':
      if (outcome.tier === 'perfect') return 'pass'
      return refused ? 'mismatch' : 'fail'
    case 'should_refuse':
      if (refused) return 'pass'
      return outcome.tier === 'perfect' ? 'mismatch' : 'fail'
    case 'should_fail_gracefully':
      if (outcome.tier === 'perfect') return 'mismatch'
      return refused || BENCH_GRACEFUL_CAUSES.includes(outcome.causeKey ?? '')
        ? 'pass'
        : 'fail'
  }
}
