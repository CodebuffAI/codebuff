import { describe, expect, test } from 'bun:test'

import { Store } from './store'

function seedProject(store: Store, now = 1000) {
  return store.insertProject({
    id: 'proj-1',
    repoUrl: 'https://github.com/acme/repo',
    rootPath: '/tmp/repo',
    dailyBudget: 1_000_000,
    concurrencyCap: 5,
    createdAt: now,
  })
}

describe('Store', () => {
  test('inserts and reads back a project with defaults', () => {
    const store = Store.memory()
    const project = seedProject(store)
    expect(project.defaultBranch).toBe('main')
    expect(project.mergeStrategy).toBe('squash')

    const read = store.getProject('proj-1')
    expect(read).not.toBeNull()
    expect(read!.repoUrl).toBe('https://github.com/acme/repo')
    expect(read!.runConfig).toEqual({})
    store.close()
  })

  test('inserts a task and defaults to proposed/human with no parents', () => {
    const store = Store.memory()
    seedProject(store)
    const task = store.insertTask({
      id: 't1',
      projectId: 'proj-1',
      title: 'Add dark mode',
      description: 'spec',
      origin: 'human',
      createdAt: 2000,
    })
    expect(task.status).toBe('proposed')
    expect(task.parents).toEqual([])

    const read = store.getTask('t1')
    expect(read!.title).toBe('Add dark mode')
    expect(read!.lastCompletedStage).toBeNull()
    store.close()
  })

  test('persists parent edges atomically with the task', () => {
    const store = Store.memory()
    seedProject(store)
    store.insertTask({
      id: 'parent',
      projectId: 'proj-1',
      title: 'p',
      description: '',
      origin: 'human',
      createdAt: 1,
    })
    store.insertTask({
      id: 'child',
      projectId: 'proj-1',
      title: 'c',
      description: '',
      origin: 'scout',
      rationale: 'follows from parent',
      spawnedFrom: 'parent',
      parents: ['parent'],
      createdAt: 2,
    })
    expect(store.getTask('child')!.parents).toEqual(['parent'])
    expect(store.getTask('child')!.spawnedFrom).toBe('parent')
    expect(store.childrenOf('parent')).toEqual(['child'])
    store.close()
  })

  test('lists tasks in FIFO creation order', () => {
    const store = Store.memory()
    seedProject(store)
    store.insertTask({ id: 'b', projectId: 'proj-1', title: 'b', description: '', origin: 'human', createdAt: 200 })
    store.insertTask({ id: 'a', projectId: 'proj-1', title: 'a', description: '', origin: 'human', createdAt: 100 })
    store.insertTask({ id: 'c', projectId: 'proj-1', title: 'c', description: '', origin: 'human', createdAt: 300 })
    expect(store.listTasks('proj-1').map((t) => t.id)).toEqual(['a', 'b', 'c'])
    store.close()
  })

  test('updateTask patches only given columns and bumps updatedAt', () => {
    const store = Store.memory()
    seedProject(store)
    store.insertTask({ id: 't1', projectId: 'proj-1', title: 't', description: '', origin: 'human', createdAt: 1 })
    store.updateTask('t1', { status: 'running', stage: 'implement' }, 5000)
    const t = store.getTask('t1')!
    expect(t.status).toBe('running')
    expect(t.stage).toBe('implement')
    expect(t.updatedAt).toBe(5000)
    expect(t.title).toBe('t')
    store.close()
  })

  test('filters tasks by status', () => {
    const store = Store.memory()
    seedProject(store)
    store.insertTask({ id: 't1', projectId: 'proj-1', title: '1', description: '', origin: 'human', createdAt: 1, status: 'ready' })
    store.insertTask({ id: 't2', projectId: 'proj-1', title: '2', description: '', origin: 'human', createdAt: 2 })
    expect(store.listTasks('proj-1', 'ready').map((t) => t.id)).toEqual(['t1'])
    store.close()
  })

  test('budget ledger upsert + read', () => {
    const store = Store.memory()
    seedProject(store)
    store.upsertBudget({ accountId: 'acct', tokensUsed: 500, windowStart: 100 })
    store.upsertBudget({ accountId: 'acct', tokensUsed: 900, windowStart: 100 })
    expect(store.getBudget('acct')).toEqual({ accountId: 'acct', tokensUsed: 900, windowStart: 100 })
    store.close()
  })

  test('chat messages persist and read back in order', () => {
    const store = Store.memory()
    seedProject(store)
    store.appendChatMessage('proj-1', { role: 'user', text: 'build X' }, 1)
    store.appendChatMessage('proj-1', { role: 'assistant', text: 'done', acts: [{ toolName: 'create_task', input: { title: 'X' } }] }, 2)
    const hist = store.getChatMessages('proj-1')
    expect(hist.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(hist[1].text).toBe('done')
    expect((hist[1].acts[0] as any).toolName).toBe('create_task')
    store.close()
  })

  test('removeEdge detaches a parent', () => {
    const store = Store.memory()
    seedProject(store)
    store.insertTask({ id: 'p', projectId: 'proj-1', title: 'p', description: '', origin: 'human', createdAt: 1 })
    store.insertTask({ id: 'c', projectId: 'proj-1', title: 'c', description: '', origin: 'human', createdAt: 2, parents: ['p'] })
    store.removeEdge({ from: 'p', to: 'c' })
    expect(store.getTask('c')!.parents).toEqual([])
    store.close()
  })
})
