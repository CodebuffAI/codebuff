import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { bunRunner } from '../core/exec'
import type { PipelineExecutors } from '../core/pipeline'
import { Engine } from './engine'

/** All-pass stub executors so the engine loop runs without the SDK/LLM. */
function stubExecutors(): PipelineExecutors {
  const ok = { run: async () => ({ kind: 'ok' as const }) }
  return {
    implement: ok,
    simplify: ok,
    review: { run: async () => ({ kind: 'ok' as const }), fix: async () => {} },
    test: ok,
    pr: { run: async () => ({ kind: 'ok' as const, prUrl: 'local://x' }) },
  }
}

function tempEngine(opts: { dailyBudget?: number; client?: unknown } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fbd-engine-'))
  const engine = new Engine({
    repoRoot: root,
    client: (opts.client ?? {}) as any, // unused unless a test exercises chat/scout
    executors: stubExecutors(),
    dailyBudget: opts.dailyBudget,
  })
  return { engine, root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

/** Executors that actually commit a per-task file in the worktree, so parent/child
 * branches carry real diffs (needed to exercise merge + restack end-to-end). */
function committingExecutors(): PipelineExecutors {
  const commit = async (ctx: any) => {
    const wt = ctx.task.worktreePath as string
    writeFileSync(join(wt, `${ctx.task.id}.txt`), `work from ${ctx.task.id}\n`)
    await bunRunner.run('git', ['-C', wt, 'add', '-A'], { cwd: wt })
    await bunRunner.run('git', ['-C', wt, 'commit', '-m', `work ${ctx.task.id}`], { cwd: wt })
    return { kind: 'ok' as const }
  }
  const ok = { run: async () => ({ kind: 'ok' as const }) }
  return {
    implement: { run: commit },
    simplify: ok,
    review: { run: async () => ({ kind: 'ok' as const }), fix: async () => {} },
    test: ok,
    pr: { run: async () => ({ kind: 'ok' as const, prUrl: 'local://x' }) },
  }
}

/** A git-backed temp repo + engine (scout off) for dependency lifecycle tests. */
async function gitEngine() {
  const root = mkdtempSync(join(tmpdir(), 'fbd-dep-'))
  await bunRunner.run('git', ['init', '-b', 'main', root])
  await bunRunner.run('git', ['-C', root, 'config', 'user.email', 't@e.com'], { cwd: root })
  await bunRunner.run('git', ['-C', root, 'config', 'user.name', 'T'], { cwd: root })
  writeFileSync(join(root, '.gitignore'), '.freebuff/\n')
  writeFileSync(join(root, 'base.txt'), 'base\n')
  await bunRunner.run('git', ['-C', root, 'add', '-A'], { cwd: root })
  await bunRunner.run('git', ['-C', root, 'commit', '-m', 'init'], { cwd: root })
  const engine = new Engine({
    repoRoot: root,
    client: {} as any,
    executors: committingExecutors(),
    enableScout: false,
  })
  return { engine, root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

/** Poll until no task is running/ready and no pipeline is in flight. */
async function settle(engine: Engine) {
  for (let i = 0; i < 300; i++) {
    await new Promise((r) => setTimeout(r, 10))
    const active = (engine as any).activePipelines.size as number
    const pending = engine.store
      .listTasks('project')
      .some((t) => t.status === 'ready' || t.status === 'running')
    if (active === 0 && !pending) return
  }
  throw new Error('engine did not settle')
}

describe('Dependent tasks start before the parent merges (§8)', () => {
  test('child runs once parent passes review, gated from merging until parent merges, then restacks', async () => {
    const { engine, cleanup } = await gitEngine()
    try {
      const parent = engine.orchestrator.createTask({ title: 'parent', description: 'd' })
      const child = engine.orchestrator.createTask({
        title: 'child',
        description: 'd',
        parents: [parent.taskId],
      })

      await engine.tick()
      await settle(engine)

      // Both ran: the child started while the parent was only awaiting-approval.
      const p1 = engine.store.getTask(parent.taskId)!
      const c1 = engine.store.getTask(child.taskId)!
      expect(p1.status).toBe('awaiting-approval')
      expect(c1.status).toBe('awaiting-approval')
      expect(c1.branch).toBeTruthy()
      expect(c1.baseRef).toBeTruthy()
      // The child was built on the parent's unmerged work.
      expect(existsSync(join(c1.worktreePath!, `${parent.taskId}.txt`))).toBe(true)
      expect(existsSync(join(c1.worktreePath!, `${child.taskId}.txt`))).toBe(true)

      // Merge gate: approving the child is a no-op while the parent isn't merged.
      await engine.approveAndMerge(child.taskId)
      expect(engine.store.getTask(child.taskId)!.status).toBe('awaiting-approval')

      // Merge the parent → child restacks onto main and becomes mergeable.
      await engine.approveAndMerge(parent.taskId)
      expect(engine.store.getTask(parent.taskId)!.status).toBe('merged')
      const c2 = engine.store.getTask(child.taskId)!
      expect(c2.status).toBe('awaiting-approval')

      // Now the child merges cleanly.
      await engine.approveAndMerge(child.taskId)
      expect(engine.store.getTask(child.taskId)!.status).toBe('merged')

      cleanup()
    } catch (err) {
      cleanup()
      throw err
    }
  })

  test('abandoning a parent blocks a child that already started', async () => {
    const { engine, cleanup } = await gitEngine()
    try {
      const parent = engine.orchestrator.createTask({ title: 'parent', description: 'd' })
      const child = engine.orchestrator.createTask({
        title: 'child',
        description: 'd',
        parents: [parent.taskId],
      })
      await engine.tick()
      await settle(engine)
      expect(engine.store.getTask(child.taskId)!.status).toBe('awaiting-approval')

      await engine.abandon(parent.taskId)
      expect(engine.store.getTask(parent.taskId)!.status).toBe('abandoned')
      const c = engine.store.getTask(child.taskId)!
      expect(c.status).toBe('blocked')
      // Worktree GC'd + branch cleared so a re-run starts fresh from main.
      expect(c.branch).toBeNull()
      cleanup()
    } catch (err) {
      cleanup()
      throw err
    }
  })

  test('merging a parent does NOT restack a blocked child (reviewed on a stable diff)', async () => {
    const { engine, cleanup } = await gitEngine()
    try {
      const parent = engine.orchestrator.createTask({ title: 'parent', description: 'd' })
      const child = engine.orchestrator.createTask({
        title: 'child',
        description: 'd',
        parents: [parent.taskId],
      })
      await engine.tick()
      await settle(engine)

      // The child halted for the human (e.g. a review failure). Its branch/base are
      // the diff the human is reviewing and must not move underneath them.
      const before = engine.store.getTask(child.taskId)!
      engine.store.updateTask(child.taskId, { status: 'blocked' }, Date.now())

      await engine.approveAndMerge(parent.taskId)
      expect(engine.store.getTask(parent.taskId)!.status).toBe('merged')
      const after = engine.store.getTask(child.taskId)!
      expect(after.status).toBe('blocked')
      expect(after.branch).toBe(before.branch)
      expect(after.baseRef).toBe(before.baseRef) // not restacked
      cleanup()
    } catch (err) {
      cleanup()
      throw err
    }
  })
})

describe('Engine budget gate (§13)', () => {
  test('exhausted budget promotes but does not admit new work', async () => {
    const { engine, cleanup } = tempEngine({ dailyBudget: 100 })
    try {
      // Spend past the ceiling within the current rolling window.
      engine.store.upsertBudget({
        accountId: 'local',
        tokensUsed: 200,
        windowStart: Date.now(),
      })
      const { taskId } = engine.orchestrator.createTask({ title: 't', description: 'd' })

      await engine.tick()

      const task = engine.store.getTask(taskId)!
      // Promoted off 'proposed' but held at 'ready' — never admitted to 'running'.
      expect(task.status).toBe('ready')
      cleanup()
    } catch (err) {
      cleanup()
      throw err
    }
  })
})

describe('Scout backlog cap (§9)', () => {
  // The Scout fires off every shipped task, so without a ceiling a small project
  // piles up a wall of proposals. It must skip while the proposed backlog is full.
  const cap = 4

  test('skips when the proposed backlog is at the cap', async () => {
    let runs = 0
    const { engine, cleanup } = tempEngine({ client: { run: async () => { runs++ } } })
    try {
      const parent = engine.orchestrator.createTask({ title: 'shipped', description: 'd' })
      for (let i = 0; i < cap; i++) {
        engine.orchestrator.createTask({ title: `p${i}`, description: 'd' }, { origin: 'scout' })
      }
      await (engine as any).runScout(parent.taskId)
      expect(runs).toBe(0) // backlog full → Scout never invokes the model
      cleanup()
    } catch (err) {
      cleanup()
      throw err
    }
  })

  test('runs when there is room in the backlog', async () => {
    let runs = 0
    const { engine, cleanup } = tempEngine({ client: { run: async () => { runs++ } } })
    try {
      const parent = engine.orchestrator.createTask({ title: 'shipped', description: 'd' })
      engine.orchestrator.createTask({ title: 'p0', description: 'd' }, { origin: 'scout' })
      await (engine as any).runScout(parent.taskId)
      expect(runs).toBe(1) // room left → Scout invokes the model
      cleanup()
    } catch (err) {
      cleanup()
      throw err
    }
  })
})
