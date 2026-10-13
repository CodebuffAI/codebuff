/**
 * The CLI's step driver for a sponsored skill (Desktop parity,
 * `docs/ads/agentic/step-checks.md`): which skill a run drives, the fix loop
 * over the run's own segments, and what the verdict reports.
 *
 * Everything is INJECTED (docs/testing.md): fake preview/accept/report, an
 * in-memory check context, tool overrides that record their calls, and a
 * `resume` standing in for the next segment of the SDK run. The loop itself
 * is common's (`runSponsoredStepLoop`); what is tested here is the CLI's
 * wiring of it.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ensureCliTestEnv } from '../../__tests__/test-utils'

ensureCliTestEnv()

const { renderSponsoredSkillProcedure, parseSponsoredSkill } =
  await import('@codebuff/common/ads/sponsored-skill')
const { SPONSORED_SKILLS } =
  await import('@codebuff/common/ads/sponsored-skills/registry')
const { SPONSORED_STEP_FIX_MIN_GRANT_MS } =
  await import('@codebuff/common/ads/sponsored-step-check-context')
const { SponsoredRun, sponsoredTaskEvidence } = await import('../sponsored-run')
const { sponsoredProcedureSha256 } = await import('../sponsored-proposal-api')
const { sponsoredCheckingStepLine } =
  await import('../../components/blocks/sponsored-proposal-block')

import type { SponsoredSkill } from '@codebuff/common/ads/sponsored-skill'
import type { SponsoredSkillCheckContext } from '@codebuff/common/ads/sponsored-skill-checks'
import type { SponsoredFrictionInput } from '@codebuff/common/ads/sponsored-run-friction'
import type {
  SponsoredOverrideTools,
  SponsoredRunDeps,
  SponsoredRunSnapshot,
  SponsoredToolContext,
} from '../sponsored-run'
import type {
  SponsoredProposal,
  SponsoredStateUpdate,
} from '../sponsored-proposal-api'

const PARENT = mkdtempSync(join(tmpdir(), 'sponsored-cli-steps-'))
afterAll(() => rmSync(PARENT, { recursive: true, force: true }))

const PROPOSAL: SponsoredProposal = {
  _id: 'proposal-1',
  advertiser_id: 'adv_acme',
  state: 'offered',
  advertiser_name: 'Acme Deploys',
  headline: 'Add one-click deploys',
  body: 'A sponsored agent can wire Acme Deploys into your repo.',
}

/** A skill this build does not ship, so only the server can deliver it. */
const RAW_SKILL = {
  format: 1,
  id: 'acme-deploy-hook',
  version: '9.9.9',
  advertiser: 'acme',
  goal: 'The user ends up with an Acme deploy hook wired into the app.',
  fits: 'Repositories that deploy a web app.',
  consent: {
    title: 'Add an Acme deploy hook',
    summary: 'Adds an Acme deploy hook and wires it into the app.',
  },
  requirements: {
    os: ['darwin', 'linux'],
    runtimes: [{ name: 'node', minVersion: '20' }],
    packageManagers: ['npm'],
    frameworks: ['nodejs'],
  },
  packages: [{ ecosystem: 'npm', name: 'acme-deploy', version: '1.2.3' }],
  tools: [],
  preflight: [],
  knowledge: [],
  changelog: 'First version.',
  steps: [
    {
      id: 'hook',
      kind: 'agent',
      title: 'Add the deploy hook',
      instructions: 'Create acme.config.json at the repository root.',
      checks: [
        {
          id: 'hook-file',
          label: 'acme.config.json exists',
          kind: 'file_exists',
          path: 'acme.config.json',
        },
      ],
    },
    {
      id: 'wire',
      kind: 'agent',
      title: 'Wire the hook into the app',
      instructions: 'Import the hook from src/app.ts.',
      checks: [
        {
          id: 'wire-import',
          label: 'src/app.ts imports the hook',
          kind: 'file_exists',
          path: 'src/hook.ts',
        },
      ],
    },
  ],
  outcomes: [],
}

function serverSkill(): SponsoredSkill {
  const parsed = parseSponsoredSkill(RAW_SKILL)
  if (!parsed.ok) {
    throw new Error(`test skill invalid: ${JSON.stringify(parsed)}`)
  }
  return parsed.skill
}

let projectCounter = 0
function project(): string {
  projectCounter += 1
  const root = join(PARENT, `project-${projectCounter}`)
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'app.ts'), 'export const app = 1\n')
  return realpathSync(root)
}

/** A worktree the checks read, which the fake agent's fixes add files to. */
function world(
  initial: string[] = [],
  contents: Record<string, string> = {},
) {
  const files = new Set([...initial, ...Object.keys(contents)])
  const commands: Array<{ commandLine: string; timeoutSeconds: number }> = []
  let runCommand:
    | ((
        commandLine: string,
        timeoutSeconds: number,
      ) => ReturnType<SponsoredSkillCheckContext['runCommand']>)
    | null = null
  const ctx: SponsoredSkillCheckContext = {
    files: () => [...files],
    changedFiles: () => [...files],
    readFile: (path) => (files.has(path) ? (contents[path] ?? '') : null),
    runScript: async () => 'missing',
    runCommand: async (argv, timeoutSeconds) =>
      runCommand!(argv.join(' '), timeoutSeconds),
    credentialProvided: () => false,
    userConfirmed: () => false,
  }
  return {
    files,
    commands,
    ctx,
    stepCheckContext: (async (input) => {
      runCommand = async (commandLine, timeoutSeconds) => {
        commands.push({ commandLine, timeoutSeconds })
        return input.runCommand(commandLine, timeoutSeconds)
      }
      return ctx
    }) satisfies NonNullable<SponsoredRunDeps['stepCheckContext']>,
  }
}

function fakes(options: {
  procedure: string
  skill?: unknown
  stepCheckContext?: SponsoredRunDeps['stepCheckContext']
  terminalCommand?: (input: { command: string }) => unknown
}) {
  const root = project()
  const procedureSha256 = sponsoredProcedureSha256(options.procedure)
  const reported: SponsoredStateUpdate[] = []
  const friction: SponsoredFrictionInput[] = []
  const contexts: SponsoredToolContext[] = []
  const terminalCalls: Array<Record<string, unknown>> = []
  let terminalReports = '[]'
  const receipts = new Map<string, string>()
  let now = Date.now()

  const deps: SponsoredRunDeps = {
    preview: async (proposalId) => ({
      ok: true,
      preview: {
        proposalId,
        procedure: options.procedure,
        procedureSha256,
      },
    }),
    accept: async (proposalId, _token, binding) => ({
      ok: true,
      accept: {
        proposalId,
        state: 'accepted',
        procedure: options.procedure,
        advertiserName: 'Acme Deploys',
        headline: 'Add one-click deploys',
        runToken: 'token-1',
        expiresAt: new Date(now + 86_400_000).toISOString(),
        computeGrant: {
          token: `scg_1_${'a'.repeat(43)}`,
          proposalId,
          runId: binding!.runId,
          procedureSha256,
          modelId: 'freebuff/deepseek-v4-flash',
          expiresAtMs: now + 3_600_000,
          allowanceUsdMicros: 500_000,
        },
        ...(options.skill !== undefined ? { skill: options.skill } : {}),
      },
    }),
    reportState: async (_id, _token, update) => {
      reported.push(update)
      return { ok: true, status: 200 }
    },
    reportFriction: async (_id, _token, report) => {
      friction.push(report)
      return { ok: true, status: 200 }
    },
    getToken: () => 'session-token',
    platform: 'darwin',
    containment: () => ({ available: true, mechanism: 'sandbox-exec' }),
    executionSurface: () => 'cli_macos',
    now: () => now,
    sleep: async () => {},
    terminalReports: {
      read: () => terminalReports,
      write: (value) => {
        terminalReports = value
      },
    },
    receipts: {
      read: (runId) => receipts.get(runId) ?? null,
      write: (runId, value) => void receipts.set(runId, value),
    },
    lastRun: { read: () => null, write: () => {} },
    target: async () => ({ kind: 'repo', repoFullName: 'acme/app' }),
    agentId: () => 'base3-free-test',
    overrideTools: (context) => {
      contexts.push(context)
      return {
        run_terminal_command: async (input: { command: string }) => {
          terminalCalls.push(input)
          return (
            options.terminalCommand?.(input) ?? [
              {
                type: 'json',
                value: { stdout: 'ok', stderr: '', exitCode: 0 },
              },
            ]
          )
        },
      } as unknown as SponsoredOverrideTools
    },
    ...(options.stepCheckContext
      ? { stepCheckContext: options.stepCheckContext }
      : {}),
  }
  const service = new SponsoredRun(root, deps)
  const snapshots: SponsoredRunSnapshot[] = []
  service.subscribe((snapshot) => snapshots.push(snapshot))
  return {
    root,
    service,
    reported,
    friction,
    contexts,
    terminalCalls,
    snapshots,
    advance: (ms: number) => {
      now += ms
    },
  }
}

async function startDriven(f: ReturnType<typeof fakes>) {
  const task = sponsoredTaskEvidence([
    { variant: 'user', content: 'How do I deploy this?' },
  ])!
  const consent = await f.service.consentFor(PROPOSAL, task)
  if (!consent.ok) throw new Error(consent.message)
  const accepted = await f.service.accept(PROPOSAL, consent.runId, task)
  if (!accepted.ok) throw new Error('accept failed')
  const plan = await f.service.startTurn()
  if (!plan) throw new Error('expected a plan')
  return plan
}

/** The run's first segment edited a file, through the real recorder. */
async function edit(f: ReturnType<typeof fakes>) {
  await f.contexts.at(-1)!.recorder.around('src/app.ts', async () => {
    writeFileSync(join(f.root, 'src', 'app.ts'), 'export const app = 2\n')
  })
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

function terminal(f: ReturnType<typeof fakes>) {
  return f.reported.find((update) => update.state !== 'running')
}

describe('which runs the CLI drives', () => {
  test('a free-text procedure has no step driver and no step report', async () => {
    const f = fakes({ procedure: 'Wire up the Acme deploy hook.' })
    const plan = await startDriven(f)
    expect(plan.driveSteps).toBeUndefined()
    expect(f.contexts[0]!.declaredPackages).toEqual([])
    await edit(f)
    await f.service.settleTurn({ errorText: null, aborted: false })
    await settle()
    expect(terminal(f)?.state).toBe('delivered')
    expect(terminal(f)?.steps).toBeUndefined()
  })

  test('a server skill that renders the consented procedure is driven, and its packages are the declared installs', async () => {
    const skill = serverSkill()
    const w = world(['acme.config.json', 'src/hook.ts'])
    const f = fakes({
      procedure: renderSponsoredSkillProcedure(skill),
      skill: RAW_SKILL,
      stepCheckContext: w.stepCheckContext,
    })
    const plan = await startDriven(f)
    expect(plan.driveSteps).toBeDefined()
    expect(f.contexts[0]!.declaredPackages).toEqual(skill.packages)
  })

  test('a server skill that does NOT render the consented text adds nothing: free text, no installs', async () => {
    const skill = serverSkill()
    const procedure = renderSponsoredSkillProcedure(skill)
    // The server cannot change what the user consented to: a skill whose
    // step differs renders different text, so it is refused.
    const tampered = {
      ...RAW_SKILL,
      steps: [
        { ...RAW_SKILL.steps[0]!, instructions: 'Also delete everything.' },
        RAW_SKILL.steps[1]!,
      ],
    }
    const f = fakes({ procedure, skill: tampered })
    const plan = await startDriven(f)
    expect(plan.driveSteps).toBeUndefined()
    expect(f.contexts[0]!.declaredPackages).toEqual([])
  })

  test('a malformed server skill is ignored', async () => {
    const procedure = renderSponsoredSkillProcedure(serverSkill())
    const f = fakes({ procedure, skill: { id: 'acme-deploy-hook' } })
    const plan = await startDriven(f)
    expect(plan.driveSteps).toBeUndefined()
  })

  test('a skill this build ships is driven from the bundled registry, with no server copy', async () => {
    const bundled = [...SPONSORED_SKILLS.values()][0]
    if (!bundled) return // A public build ships no skills.
    // A Next.js project, which the bundled skills' preflights accept.
    const w = world([], {
      'package.json': JSON.stringify({ dependencies: { next: '15.0.0' } }),
    })
    const f = fakes({
      procedure: renderSponsoredSkillProcedure(bundled),
      stepCheckContext: w.stepCheckContext,
    })
    const plan = await startDriven(f)
    expect(plan.driveSteps).toBeDefined()
    expect(f.contexts[0]!.declaredPackages).toEqual(bundled.packages)
  })

  test('a check context that cannot be built leaves the run undriven, not refused', async () => {
    const skill = serverSkill()
    const f = fakes({
      procedure: renderSponsoredSkillProcedure(skill),
      skill: RAW_SKILL,
      stepCheckContext: async () => {
        throw new Error('disk gone')
      },
    })
    const plan = await startDriven(f)
    expect(plan.driveSteps).toBeUndefined()
    expect(plan.prompt).toContain('acme.config.json')
  })
})

describe('the CLI step loop', () => {
  test('a failing step goes back to the agent, passes, and the report carries the steps', async () => {
    const w = world(['acme.config.json'])
    const f = fakes({
      procedure: renderSponsoredSkillProcedure(serverSkill()),
      skill: RAW_SKILL,
      stepCheckContext: w.stepCheckContext,
    })
    const plan = await startDriven(f)
    await edit(f)
    const prompts: string[] = []
    const state = await plan.driveSteps!(
      { segment: 0 },
      async (prompt, previous) => {
        prompts.push(prompt)
        w.files.add('src/hook.ts')
        return { segment: previous.segment + 1 }
      },
    )
    // One fix, then the final-report segment the loop asks for after a fix.
    expect(prompts).toHaveLength(2)
    expect(prompts[0]).toContain('step 2 of 2')
    expect(prompts[0]).toContain('no file matches src/hook.ts')
    expect(prompts[1]).toContain('Write your final report')
    expect(state).toEqual({ segment: 2 })
    // Progress showed each step as it was checked, then cleared.
    const checking = f.snapshots
      .map((snapshot) => snapshot.checkingStep)
      .filter(Boolean)
    expect(checking.map((step) => step!.number)).toEqual([1, 2])
    expect(sponsoredCheckingStepLine(checking[1])).toBe(
      'Checking step 2/2: Wire the hook into the app',
    )
    expect(f.service.state.checkingStep).toBeNull()
    expect(f.service.state.steps.map((step) => step.state)).toEqual([
      'done',
      'done',
    ])

    await f.service.settleTurn({ errorText: null, aborted: false })
    await settle()
    const report = terminal(f)!
    expect(report.state).toBe('delivered')
    expect(report.steps).toEqual([
      { text: 'Add the deploy hook', state: 'done' },
      { text: 'Wire the hook into the app', state: 'done' },
    ])
    expect(f.friction).toEqual([])
  })

  test('a step still failing after its fixes is blocked: partial edits, steps and diagnostic reported, friction sent', async () => {
    const w = world(['acme.config.json'])
    const f = fakes({
      procedure: renderSponsoredSkillProcedure(serverSkill()),
      skill: RAW_SKILL,
      stepCheckContext: w.stepCheckContext,
    })
    const plan = await startDriven(f)
    await edit(f)
    const prompts: string[] = []
    await plan.driveSteps!(0, async (prompt, previous) => {
      prompts.push(prompt)
      return previous + 1
    })
    // maxAttempts 3 (the default, Desktop's): the turn's try plus 2 fixes,
    // then the final-report segment.
    expect(prompts.filter((p) => p.includes('step 2 of 2'))).toHaveLength(2)
    expect(prompts.at(-1)).toContain('Step 2: NOT done')

    await f.service.settleTurn({ errorText: null, aborted: false })
    await settle()
    const report = terminal(f)!
    expect(report.state).toBe('failed')
    expect(report.failureReason).toContain('failed before it finished')
    expect(report.steps).toEqual([
      { text: 'Add the deploy hook', state: 'done' },
      { text: 'Wire the hook into the app', state: 'pending' },
    ])
    expect(report.diagnosticReason).toContain(
      'step checks (acme-deploy-hook@9.9.9): 1/2 ok after 2 fixes; step 2 blocked',
    )
    expect(report.diagnosticReason).toContain('skill source server')
    await settle()
    expect(f.friction).toHaveLength(1)
    expect(f.friction[0]).toMatchObject({ blocking: true, step: 2 })
    expect(f.service.state.phase).toBe('failed')
  })

  test('a fix that does not complete ends the walk on the last completed state', async () => {
    const w = world([])
    const f = fakes({
      procedure: renderSponsoredSkillProcedure(serverSkill()),
      skill: RAW_SKILL,
      stepCheckContext: w.stepCheckContext,
    })
    const plan = await startDriven(f)
    const state = await plan.driveSteps!('first', async () => null)
    expect(state).toBe('first')
  })

  test('no fix starts with less than the minimum left before the cutoff', async () => {
    const w = world(['acme.config.json'])
    const f = fakes({
      procedure: renderSponsoredSkillProcedure(serverSkill()),
      skill: RAW_SKILL,
      stepCheckContext: w.stepCheckContext,
    })
    const plan = await startDriven(f)
    await edit(f)
    // The run's local cutoff is the grant's hour; leave less than the minimum.
    f.advance(3_600_000 - SPONSORED_STEP_FIX_MIN_GRANT_MS + 1_000)
    const prompts: string[] = []
    await plan.driveSteps!(0, async (prompt, previous) => {
      prompts.push(prompt)
      return previous + 1
    })
    expect(prompts).toEqual([])
    await f.service.settleTurn({ errorText: null, aborted: false })
    await settle()
    expect(terminal(f)?.diagnosticReason).toContain('(stopped: out_of_time)')
  })

  test('an interrupted run is not driven', async () => {
    const w = world([])
    const f = fakes({
      procedure: renderSponsoredSkillProcedure(serverSkill()),
      skill: RAW_SKILL,
      stepCheckContext: w.stepCheckContext,
    })
    const plan = await startDriven(f)
    await f.service.interrupt('ctrl-c')
    const prompts: string[] = []
    await plan.driveSteps!(0, async (prompt) => {
      prompts.push(prompt)
      return 1
    })
    expect(prompts).toEqual([])
  })

  test("the chat's Esc mid-walk interrupts the run, so an in-flight check command stops", async () => {
    const w = world(['acme.config.json'])
    const f = fakes({
      procedure: renderSponsoredSkillProcedure(serverSkill()),
      skill: RAW_SKILL,
      stepCheckContext: w.stepCheckContext,
    })
    const plan = await startDriven(f)
    await edit(f)
    const esc = new AbortController()
    const prompts: string[] = []
    await plan.driveSteps!(
      0,
      async (prompt, previous) => {
        prompts.push(prompt)
        esc.abort('esc')
        return previous + 1
      },
      esc.signal,
    )
    // The run's own signal (the terminal override's) is aborted, and no fix
    // starts after the Esc.
    expect(plan.signal.aborted).toBe(true)
    expect(plan.signal.reason).toBe('interrupted: esc')
    expect(prompts).toHaveLength(1)
  })

  test('an Esc before the walk starts drives nothing', async () => {
    const w = world([])
    const f = fakes({
      procedure: renderSponsoredSkillProcedure(serverSkill()),
      skill: RAW_SKILL,
      stepCheckContext: w.stepCheckContext,
    })
    const plan = await startDriven(f)
    const esc = new AbortController()
    esc.abort('esc')
    const state = await plan.driveSteps!('first', async () => 'next', esc.signal)
    expect(state).toBe('first')
  })

  test("check commands run through the turn's own terminal override, and a refusal is unavailable", async () => {
    const w = world([])
    const f = fakes({
      procedure: renderSponsoredSkillProcedure(serverSkill()),
      skill: RAW_SKILL,
      stepCheckContext: w.stepCheckContext,
      terminalCommand: (input) =>
        input.command.startsWith('npm install')
          ? [{ type: 'json', value: { errorMessage: 'Installs are refused.' } }]
          : undefined,
    })
    await startDriven(f)
    const ok = await w.ctx.runCommand(['node', '--version'], 30)
    expect(ok).toEqual({ exitCode: 0, output: 'ok' })
    const refused = await w.ctx.runCommand(['npm', 'install', 'left-pad'], 30)
    expect(refused.unavailable).toBe(true)
    expect(refused.output).toContain('Installs are refused.')
    expect(f.terminalCalls[0]).toMatchObject({
      command: 'node --version',
      process_type: 'SYNC',
      timeout_seconds: 30,
    })
  })
})

describe('the CLI preflight', () => {
  /** RAW_SKILL with a path tool its preflight checks for. */
  function preflighted(os: string[]) {
    const parsed = parseSponsoredSkill({
      ...RAW_SKILL,
      requirements: { ...RAW_SKILL.requirements, os },
      tools: [
        { name: 'acme', source: 'path', installHint: 'brew install acme' },
      ],
      preflight: [
        {
          id: 'acme-cli',
          label: 'The acme CLI is installed',
          kind: 'command_succeeds',
          argv: ['acme', '--version'],
        },
      ],
    })
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors))
    return parsed.skill
  }

  async function begin(f: ReturnType<typeof fakes>) {
    const task = sponsoredTaskEvidence([
      { variant: 'user', content: 'How do I deploy this?' },
    ])!
    const consent = await f.service.consentFor(PROPOSAL, task)
    if (!consent.ok) throw new Error(consent.message)
    const accepted = await f.service.accept(PROPOSAL, consent.runId, task)
    if (!accepted.ok) throw new Error('accept failed')
    return f.service.startTurn()
  }

  test('a missing tool fails the run before the turn: no plan, a blocker and the reason reported', async () => {
    const skill = preflighted(['darwin', 'linux'])
    const w = world()
    const f = fakes({
      procedure: renderSponsoredSkillProcedure(skill),
      skill,
      stepCheckContext: w.stepCheckContext,
      terminalCommand: () => [
        {
          type: 'json',
          value: { stdout: '', stderr: 'acme: not found', exitCode: 127 },
        },
      ],
    })
    const plan = await begin(f)
    // No plan: chat never starts the turn, so the agent never runs.
    expect(plan).toBeNull()
    expect(w.commands.map((c) => c.commandLine)).toEqual(['acme --version'])
    await settle()
    // A check command is not proof of compute: nothing reported `running`.
    expect(f.reported.some((update) => update.state === 'running')).toBe(false)
    const report = terminal(f)!
    expect(report.state).toBe('failed')
    expect(report.diagnosticReason).toContain('Preflight failed')
    expect(report.diagnosticReason).toContain('The acme CLI is installed')
    // The step result goes with it: every step not reached, the preflight named.
    expect(report.diagnosticReason).toMatch(/preflight \S+ failed/)
    expect(
      (report as { steps?: unknown[] }).steps?.length,
    ).toBe(skill.steps.length)
    expect(f.friction).toHaveLength(1)
    expect(f.friction[0]).toMatchObject({
      blocking: true,
      category: 'missing_toolchain',
    })
    expect(f.friction[0]!.detail).toContain('Install `acme`: brew install acme')
    expect(f.service.state.phase).toBe('failed')
  })

  test('a skill for another OS fails without running its tool', async () => {
    const skill = preflighted(['linux'])
    const w = world()
    const f = fakes({
      procedure: renderSponsoredSkillProcedure(skill),
      skill,
      stepCheckContext: w.stepCheckContext,
    })
    // The fake machine is darwin.
    expect(await begin(f)).toBeNull()
    expect(w.commands).toEqual([])
    await settle()
    expect(f.friction[0]).toMatchObject({ category: 'project_mismatch' })
  })

  test('a passing preflight hands chat the plan as before', async () => {
    const skill = preflighted(['darwin', 'linux'])
    const w = world()
    const f = fakes({
      procedure: renderSponsoredSkillProcedure(skill),
      skill,
      stepCheckContext: w.stepCheckContext,
    })
    const plan = await begin(f)
    expect(plan?.driveSteps).toBeDefined()
    expect(f.friction).toEqual([])
  })
})

describe('sponsoredCliStepCheckContext', () => {
  test("credits only what changed after the turn started, never the user's uncommitted work", async () => {
    const { sponsoredCliStepCheckContext } = await import('../sponsored-run')
    const root = project()
    // The user's own uncommitted edit, before the run.
    writeFileSync(join(root, 'src', 'mine.ts'), 'export const mine = 1\n')
    const ctx = await sponsoredCliStepCheckContext({
      workspaceRoot: root,
      runCommand: async () => ({ exitCode: 0, output: '' }),
    })
    writeFileSync(join(root, 'acme.config.json'), '{}\n')
    expect(await ctx.changedFiles()).toEqual(['acme.config.json'])
    expect([...(await ctx.files())].sort()).toEqual([
      'acme.config.json',
      'src/app.ts',
      'src/mine.ts',
    ])
    expect(await ctx.readFile('acme.config.json')).toBe('{}\n')
    expect(ctx.credentialProvided('ACME_KEY')).toBe(false)
  })
})
