import { describe, expect, test } from 'bun:test'

import { DocStore } from './docs'
import { Orchestrator, OrchestratorError } from './orchestrator'
import { Store } from './store'

function harness() {
  const store = Store.memory()
  store.insertProject({
    id: 'p',
    repoUrl: 'r',
    rootPath: '/tmp',
    dailyBudget: 1000,
    concurrencyCap: 5,
    createdAt: 0,
  })
  let id = 0
  let now = 0
  const orch = new Orchestrator({
    store,
    projectId: 'p',
    docs: new DocStore({ docsDir: '/tmp/does-not-exist' }),
    idGen: () => `task-${++id}`,
    clock: () => ++now,
  })
  return { store, orch }
}

describe('Orchestrator.createTask', () => {
  test('creates a human task by default', () => {
    const { store, orch } = harness()
    const { taskId } = orch.createTask({ title: 'X', description: 'spec' })
    const task = store.getTask(taskId)!
    expect(task.origin).toBe('human')
    expect(task.status).toBe('proposed')
  })

  test('scout tasks carry origin + rationale', () => {
    const { store, orch } = harness()
    const { taskId } = orch.createTask(
      { title: 'Y', description: 's' },
      { origin: 'scout', rationale: 'follow-up' },
    )
    const task = store.getTask(taskId)!
    expect(task.origin).toBe('scout')
    expect(task.rationale).toBe('follow-up')
  })

  test('rejects unknown parents', () => {
    const { orch } = harness()
    expect(() =>
      orch.createTask({ title: 'X', description: 's', parents: ['ghost'] }),
    ).toThrow(OrchestratorError)
  })

  test('wires valid parents', () => {
    const { store, orch } = harness()
    const a = orch.createTask({ title: 'A', description: '' }).taskId
    const b = orch.createTask({ title: 'B', description: '', parents: [a] }).taskId
    expect(store.getTask(b)!.parents).toEqual([a])
  })
})

describe('Orchestrator.addDependency', () => {
  test('rejects cycles', () => {
    const { orch } = harness()
    const a = orch.createTask({ title: 'A', description: '' }).taskId
    const b = orch.createTask({ title: 'B', description: '' }).taskId
    orch.addDependency({ from: a, to: b }) // b depends on a
    expect(() => orch.addDependency({ from: b, to: a })).toThrow(/cycle/i)
  })

  test('rejects edges referencing missing tasks', () => {
    const { orch } = harness()
    const a = orch.createTask({ title: 'A', description: '' }).taskId
    expect(() => orch.addDependency({ from: a, to: 'ghost' })).toThrow(
      OrchestratorError,
    )
  })
})

describe('Orchestrator.abandonTask', () => {
  test('blocks unmerged dependents', () => {
    const { store, orch } = harness()
    const a = orch.createTask({ title: 'A', description: '' }).taskId
    const b = orch.createTask({ title: 'B', description: '', parents: [a] }).taskId
    orch.abandonTask({ taskId: a })
    expect(store.getTask(a)!.status).toBe('abandoned')
    expect(store.getTask(b)!.status).toBe('blocked')
  })
})

describe('Orchestrator.sendGuidance', () => {
  test('rejects guidance to a non-live (proposed) task', () => {
    const { orch } = harness()
    const a = orch.createTask({ title: 'A', description: '' }).taskId
    expect(() => orch.sendGuidance({ taskId: a, message: 'hi' })).toThrow(
      /not live|status/i,
    )
  })

  test('allows guidance to a running task', () => {
    const { store, orch } = harness()
    const a = orch.createTask({ title: 'A', description: '' }).taskId
    store.updateTask(a, { status: 'running', stage: 'implement' }, 1)
    expect(orch.sendGuidance({ taskId: a, message: 'also SSO' })).toEqual({
      taskId: a,
      message: 'also SSO',
    })
  })
})

describe('Orchestrator inspection', () => {
  test('getTask and listTasks reflect the graph', () => {
    const { orch } = harness()
    const a = orch.createTask({ title: 'A', description: '' }).taskId
    orch.createTask({ title: 'B', description: '' })
    expect(orch.getTask({ taskId: a }).status).toBe('proposed')
    expect(orch.listTasks().map((t) => t.title)).toEqual(['A', 'B'])
  })

  test('readDoc rejects unknown doc names', () => {
    const { orch } = harness()
    expect(() => orch.readDoc({ name: 'nope' as never })).toThrow(/doc/i)
  })
})
