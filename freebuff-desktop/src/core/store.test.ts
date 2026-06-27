import { describe, expect, test } from 'bun:test'

import { Store } from './store'

function seeded(): Store {
  const store = Store.memory()
  store.insertProject({
    id: 'project',
    repoUrl: 'r',
    rootPath: '/tmp/r',
    createdAt: 1,
  })
  return store
}

describe('Store — threads', () => {
  test('insert, get, list (open only), update, close', () => {
    const store = seeded()
    const a = store.insertThread({ id: 'th1', projectId: 'project', createdAt: 1 })
    expect(a.status).toBe('open')
    expect(a.autoQueueSuggestions).toBe(false)
    store.insertThread({ id: 'th2', projectId: 'project', title: 'Two', createdAt: 2 })

    expect(store.getThread('th1')!.title).toBe('New thread')
    expect(store.listThreads('project').length).toBe(2)

    store.updateThread('th1', { title: 'Renamed', autoQueueSuggestions: true, branch: 'freebuff/x' }, 5)
    const t = store.getThread('th1')!
    expect(t.title).toBe('Renamed')
    expect(t.autoQueueSuggestions).toBe(true)
    expect(t.branch).toBe('freebuff/x')

    store.updateThread('th2', { status: 'closed' }, 6)
    expect(store.listThreads('project', { status: 'open' }).map((t) => t.id)).toEqual(['th1'])
  })

  test('messages round-trip with acts', () => {
    const store = seeded()
    store.insertThread({ id: 'th1', projectId: 'project', createdAt: 1 })
    store.appendMessage('th1', { role: 'user', text: 'hi' }, 1)
    store.appendMessage(
      'th1',
      { role: 'assistant', text: 'ok', acts: [{ toolName: 'write_file', input: { path: 'a' } }] },
      2,
    )
    const msgs = store.getMessages('th1')
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect((msgs[1].acts as any[])[0].toolName).toBe('write_file')
  })
})

describe('Store — queue items', () => {
  test('lanes, ordering, nextQueuedItem, maxPosition', () => {
    const store = seeded()
    store.insertThread({ id: 'th1', projectId: 'project', createdAt: 1 })
    const mk = (id: string, pos: number, state: any = 'queued') =>
      store.insertQueueItem({
        id,
        threadId: 'th1',
        prompt: id,
        state,
        source: 'user',
        position: pos,
        createdAt: 1,
      })
    mk('b', 2)
    mk('a', 1)
    mk('c', 3)
    mk('s1', 1, 'suggested')

    expect(store.listQueueItems('th1', 'queued').map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(store.nextQueuedItem('th1')!.id).toBe('a')
    expect(store.maxPosition('th1', 'queued')).toBe(3)
    expect(store.maxPosition('th1', 'suggested')).toBe(1)

    // Promote a suggestion to the bottom of the queued lane.
    store.updateQueueItem('s1', { state: 'queued', position: 4 }, 2)
    expect(store.listQueueItems('th1', 'queued').map((i) => i.id)).toEqual(['a', 'b', 'c', 's1'])

    store.updateQueueItem('a', { state: 'done' }, 3)
    expect(store.nextQueuedItem('th1')!.id).toBe('b')

    store.deleteQueueItem('b')
    expect(store.nextQueuedItem('th1')!.id).toBe('c')
  })

  test('fractional position lets an item insert between neighbors', () => {
    const store = seeded()
    store.insertThread({ id: 'th1', projectId: 'project', createdAt: 1 })
    const mk = (id: string, pos: number) =>
      store.insertQueueItem({ id, threadId: 'th1', prompt: id, state: 'queued', source: 'user', position: pos, createdAt: 1 })
    mk('a', 1)
    mk('c', 2)
    mk('b', 1.5)
    expect(store.listQueueItems('th1', 'queued').map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('Store — workflows', () => {
  test('upsert, get, list', () => {
    const store = seeded()
    store.upsertWorkflow('project', 'ship', ['review', 'test'])
    expect(store.getWorkflow('project', 'ship')!.skills).toEqual(['review', 'test'])
    store.upsertWorkflow('project', 'ship', ['review', 'simplify', 'test', 'reflect'])
    expect(store.getWorkflow('project', 'ship')!.skills.length).toBe(4)
    store.upsertWorkflow('project', 'polish', ['simplify'])
    expect(store.listWorkflows('project').map((w) => w.name)).toEqual(['polish', 'ship'])
  })
})
