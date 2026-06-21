import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

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
