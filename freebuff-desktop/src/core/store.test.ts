import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { Store } from './store'

/** Column-name set of a table, queried fresh from a live db. */
function columns(db: Database, table: string): Set<string> {
  const rows = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return new Set(rows.map((r) => r.name))
}

function tableExists(db: Database, table: string): boolean {
  const row = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(table)
  return row != null
}

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
    expect(a.prState).toBe('none')
    expect(a.lastTurnOutcome).toBeNull()
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

  test('pr_state round-trips through the store (default "none", accepts updates)', () => {
    const store = seeded()
    store.insertThread({ id: 'th1', projectId: 'project', createdAt: 1 })
    // Default is 'none' on insert; passing via update path works for the four
    // PR lifecycle states the engine infers from tool calls (see
    // ThreadEngine.observePrIntent).
    expect(store.getThread('th1')!.prState).toBe('none')
    store.updateThread('th1', { prState: 'open' }, 2)
    expect(store.getThread('th1')!.prState).toBe('open')
    store.updateThread('th1', { prState: 'merged' }, 3)
    expect(store.getThread('th1')!.prState).toBe('merged')
    store.updateThread('th1', { prState: 'closed' }, 4)
    expect(store.getThread('th1')!.prState).toBe('closed')
    store.updateThread('th1', { prState: 'none' }, 5)
    expect(store.getThread('th1')!.prState).toBe('none')
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

describe('Store — migrations (upgrade path)', () => {
  let dir: string
  let dbPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fb-store-mig-'))
    dbPath = join(dir, 'desktop.db')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  /** Build a representative pre-v10 database directly (the shape before the
   *  additive thread columns / parts_json / budget drop), seed a row in each
   *  table, and stamp an old user_version so opening via Store runs migrate(). */
  function buildLegacyDb(): void {
    const db = new Database(dbPath, { create: true })
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY, repo_url TEXT NOT NULL, root_path TEXT NOT NULL,
        default_branch TEXT NOT NULL DEFAULT 'main', run_config TEXT NOT NULL DEFAULT '{}',
        merge_strategy TEXT NOT NULL DEFAULT 'squash', daily_budget INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE threads (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'New thread',
        status TEXT NOT NULL DEFAULT 'open', autorun INTEGER NOT NULL DEFAULT 0,
        branch TEXT, worktree_path TEXT, base_ref TEXT, pr_url TEXT,
        turn_state TEXT NOT NULL DEFAULT 'idle', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE messages (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT NOT NULL, role TEXT NOT NULL,
        text TEXT NOT NULL DEFAULT '', acts_json TEXT NOT NULL DEFAULT '[]', ts INTEGER NOT NULL
      );
      CREATE TABLE budget_ledger (id INTEGER PRIMARY KEY, amount INTEGER);
      INSERT INTO projects (id, repo_url, root_path, daily_budget, created_at)
        VALUES ('project', 'r', '/tmp/r', 500, 1);
      INSERT INTO threads (id, project_id, title, status, autorun, turn_state, created_at, updated_at)
        VALUES ('th1', 'project', 'Legacy thread', 'open', 1, 'idle', 1, 1);
      INSERT INTO messages (thread_id, role, text, acts_json, ts)
        VALUES ('th1', 'user', 'hello', '[]', 1);
      PRAGMA user_version = 5;
    `)
    db.close()
  }

  test('upgrading a pre-v10 db preserves data and adds the new columns', () => {
    buildLegacyDb()
    const store = new Store(dbPath)

    // Data survived the upgrade.
    expect(store.getProject('project')!.repoUrl).toBe('r')
    const t = store.getThread('th1')!
    expect(t.title).toBe('Legacy thread')
    expect(store.getMessages('th1')[0].text).toBe('hello')

    // New thread columns resolve to their safe defaults.
    expect(t.prState).toBe('none')
    expect(t.lastSeenHead).toBeNull()
    expect(t.harnessId).toBeNull()
    expect(t.freebuffModel).toBeNull()
    // autorun=1 carried over to auto_queue_suggestions (the documented contract).
    expect(t.autoQueueSuggestions).toBe(true)

    store.close()
  })

  test('upgrade drops the removed budget schema and renames autorun', () => {
    buildLegacyDb()
    const store = new Store(dbPath)

    expect(tableExists(store.db, 'budget_ledger')).toBe(false)
    const threadCols = columns(store.db, 'threads')
    expect(threadCols.has('autorun')).toBe(false)
    expect(threadCols.has('auto_queue_suggestions')).toBe(true)
    expect(columns(store.db, 'projects').has('daily_budget')).toBe(false)
    expect(columns(store.db, 'messages').has('parts_json')).toBe(true)

    store.close()
  })

  test('an upgraded db ends with the same table shape as a fresh one', () => {
    buildLegacyDb()
    const upgraded = new Store(dbPath)
    const fresh = Store.memory()

    // The CREATE-TABLE path (fresh) and the ALTER path (upgrade) must converge,
    // or new columns would silently differ between new and upgraded installs.
    for (const table of ['projects', 'threads', 'messages', 'queue_items', 'workflows']) {
      expect([...columns(upgraded.db, table)].sort()).toEqual(
        [...columns(fresh.db, table)].sort(),
      )
    }

    upgraded.close()
    fresh.close()
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
