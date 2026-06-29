/**
 * Local-first persistence for a single project (thread model).
 *
 * One SQLite database per project, living under `<project>/.freebuff/desktop.db`,
 * so a project is portable with its repo. Governing docs are NOT rows — they are
 * markdown files under `.freebuff/docs/`; skills are markdown files under
 * `.freebuff/skills/`. Both are handled by their own file-backed stores.
 *
 * Uses `bun:sqlite` (built into the Bun runtime the orchestrator process runs on).
 */

import { Database } from 'bun:sqlite'

import type { Part } from './parts'
import type {
  HarnessId,
  MergeStrategy,
  Project,
  ProjectId,
  QueueItem,
  QueueItemSource,
  QueueItemState,
  RunConfig,
  Thread,
  ThreadId,
  ThreadStatus,
  TurnState,
  Workflow,
} from './types'

/** Bump when the schema changes; `migrate()` recreates dropped tables. */
const SCHEMA_VERSION = 10

const toSnake = (key: string): string => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

/**
 * Build an `UPDATE … SET col = $col, …, updated_at = $updated WHERE id = $id`
 * from a typed patch, mapping camelCase keys to snake_case columns. `boolKeys`
 * are coerced to 0/1. Returns null when the patch is empty.
 */
function buildUpdate(
  table: string,
  id: string,
  patch: Record<string, unknown>,
  now: number,
  boolKeys: readonly string[] = [],
): { sql: string; params: Record<string, string | number | null> } | null {
  const sets: string[] = []
  const params: Record<string, string | number | null> = { $id: id, $updated: now }
  for (const [key, value] of Object.entries(patch)) {
    sets.push(`${toSnake(key)} = $${key}`)
    params[`$${key}`] = boolKeys.includes(key) ? (value ? 1 : 0) : (value as string | number | null)
  }
  if (sets.length === 0) return null
  return {
    sql: `UPDATE ${table} SET ${sets.join(', ')}, updated_at = $updated WHERE id = $id`,
    params,
  }
}

export interface NewProjectInput {
  id: string
  repoUrl: string
  rootPath: string
  defaultBranch?: string
  runConfig?: RunConfig
  mergeStrategy?: MergeStrategy
  createdAt: number
}

export interface NewThreadInput {
  id: ThreadId
  projectId: string
  title?: string
  status?: ThreadStatus
  /** Per-thread agent selection. Null means "use the engine's default". */
  harnessId?: HarnessId | null
  /** Per-thread Freebuff model. Null means "use the recommended default". */
  freebuffModel?: string | null
  autoQueueSuggestions?: boolean
  createdAt: number
}

export interface NewQueueItemInput {
  id: string
  threadId: ThreadId
  prompt: string
  label?: string | null
  state: QueueItemState
  source: QueueItemSource
  skillName?: string | null
  workflowRunId?: string | null
  workflowName?: string | null
  position: number
  createdAt: number
}

/**
 * Fields the engine can update on a thread. `lastTurnOutcome` is intentionally
 * NOT in this list — it's a transient UI flag (in-memory only) so the tab icon
 * can mark a stop/error distinctly, but it should reset on restart since
 * "this turn was stopped" only makes sense while the user's session is alive.
 */
export type ThreadPatch = Partial<
  Pick<
    Thread,
    | 'title'
    | 'status'
    | 'harnessId'
    | 'freebuffModel'
    | 'autoQueueSuggestions'
    | 'branch'
    | 'worktreePath'
    | 'baseRef'
    | 'lastSeenHead'
    | 'prUrl'
    | 'prState'
    | 'turnState'
  >
>

export type QueueItemPatch = Partial<
  Pick<
    QueueItem,
    'prompt' | 'label' | 'state' | 'source' | 'skillName' | 'workflowRunId' | 'workflowName' | 'position'
  >
>

type ProjectRow = {
  id: string
  repo_url: string
  root_path: string
  default_branch: string
  run_config: string
  merge_strategy: MergeStrategy
  created_at: number
}

type ThreadRow = {
  id: string
  project_id: string
  title: string
  status: ThreadStatus
  /** Per-thread agent (Codebuff/Claude Code). Mirrors Thread.harnessId. Null
   *  means the engine's default applies. */
  harness_id: HarnessId | null
  freebuff_model: string | null
  auto_queue_suggestions: number
  branch: string | null
  worktree_path: string | null
  base_ref: string | null
  last_seen_head: string | null
  pr_url: string | null
  pr_state: Thread['prState']
  turn_state: TurnState
  created_at: number
  updated_at: number
}

type QueueRow = {
  id: string
  thread_id: string
  prompt: string
  label: string | null
  state: QueueItemState
  source: QueueItemSource
  skill_name: string | null
  workflow_run_id: string | null
  workflow_name: string | null
  position: number
  created_at: number
  updated_at: number
}

export class Store {
  readonly db: Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { create: true })
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.migrate()
  }

  /** Open an in-memory store — used by tests. */
  static memory(): Store {
    return new Store(':memory:')
  }

  close(): void {
    this.db.close()
  }

  private migrate(): void {
    const current = (
      this.db.query('PRAGMA user_version').get() as { user_version: number }
    ).user_version
    if (current >= SCHEMA_VERSION) return

    // The task-graph era tables are gone in the thread model. The DB is local,
    // in-repo, and gitignored, so a clean re-create is acceptable. `projects`
    // is preserved here; `budget_ledger` is dropped below since Freebuff has
    // no spend/budget concept to track.
    this.db.exec(`
      DROP TABLE IF EXISTS task_artifacts;
      DROP TABLE IF EXISTS dependency_edges;
      DROP TABLE IF EXISTS chat_messages;
      DROP TABLE IF EXISTS tasks;
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id               TEXT PRIMARY KEY,
        repo_url         TEXT NOT NULL,
        root_path        TEXT NOT NULL,
        default_branch   TEXT NOT NULL DEFAULT 'main',
        run_config       TEXT NOT NULL DEFAULT '{}',
        merge_strategy   TEXT NOT NULL DEFAULT 'squash',
        created_at       INTEGER NOT NULL
      );

      -- One conversation = one tab = one worktree/branch.
      CREATE TABLE IF NOT EXISTS threads (
        id            TEXT PRIMARY KEY,
        project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title         TEXT NOT NULL DEFAULT 'New thread',
        status        TEXT NOT NULL DEFAULT 'open',
        harness_id    TEXT,
        freebuff_model TEXT,
        auto_queue_suggestions INTEGER NOT NULL DEFAULT 0,
        branch        TEXT,
        worktree_path TEXT,
        base_ref      TEXT,
        last_seen_head TEXT,
        pr_url        TEXT,
        pr_state      TEXT NOT NULL DEFAULT 'none',
        turn_state    TEXT NOT NULL DEFAULT 'idle',
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_threads_project ON threads(project_id, created_at);

      -- Chat transcript, thread-scoped.
      CREATE TABLE IF NOT EXISTS messages (
        seq        INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id  TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        role       TEXT NOT NULL,
        text       TEXT NOT NULL DEFAULT '',
        acts_json  TEXT NOT NULL DEFAULT '[]',
        parts_json TEXT NOT NULL DEFAULT '[]',
        ts         INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, seq);

      -- Unified queue + suggestions. Lane is the state column.
      CREATE TABLE IF NOT EXISTS queue_items (
        id              TEXT PRIMARY KEY,
        thread_id       TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        prompt          TEXT NOT NULL,
        label           TEXT,
        state           TEXT NOT NULL,
        source          TEXT NOT NULL,
        skill_name      TEXT,
        workflow_run_id TEXT,
        workflow_name   TEXT,
        position        REAL NOT NULL,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_queue_thread_state
        ON queue_items(thread_id, state, position);

      -- Named ordered list of skill names. Project-scoped.
      CREATE TABLE IF NOT EXISTS workflows (
        project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        skills_json TEXT NOT NULL,
        PRIMARY KEY (project_id, name)
      );
    `)

    // v8: drop the budget_ledger table (no spend tracking) and the daily_budget
    // column on projects. Column drops need a table rebuild in SQLite; do that
    // once for any pre-v8 DB so we leave a clean shape behind.
    this.db.exec('DROP TABLE IF EXISTS budget_ledger')
    const projectCols = (
      this.db.query('PRAGMA table_info(projects)').all() as { name: string }[]
    ).map((c) => c.name)
    if (projectCols.includes('daily_budget')) {
      // Recreate `projects` without `daily_budget`. The data we care about
      // (id/repo_url/root_path/default_branch/run_config/merge_strategy/created_at)
      // is preserved; the column is just gone.
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS projects__v8 (
          id               TEXT PRIMARY KEY,
          repo_url         TEXT NOT NULL,
          root_path        TEXT NOT NULL,
          default_branch   TEXT NOT NULL DEFAULT 'main',
          run_config       TEXT NOT NULL DEFAULT '{}',
          merge_strategy   TEXT NOT NULL DEFAULT 'squash',
          created_at       INTEGER NOT NULL
        );
        INSERT INTO projects__v8 (id, repo_url, root_path, default_branch,
          run_config, merge_strategy, created_at)
          SELECT id, repo_url, root_path, default_branch, run_config,
            merge_strategy, created_at FROM projects;
        DROP TABLE projects;
        ALTER TABLE projects__v8 RENAME TO projects;
      `)
    }

    // v6: the per-thread `autorun` flag is gone (the queue always auto-drains).
    // Repurpose the column as `auto_queue_suggestions` on existing dbs without
    // dropping thread history. (Fresh dbs already create the new column above.)
    // Prior values carry over verbatim: `autorun=0` (the overwhelming default)
    // becomes `auto_queue_suggestions=false`, the safe default; the rare user who
    // had autorun on will now auto-queue suggestions instead — acceptable.
    const threadCols = (
      this.db.query('PRAGMA table_info(threads)').all() as { name: string }[]
    ).map((c) => c.name)
    if (threadCols.includes('autorun') && !threadCols.includes('auto_queue_suggestions')) {
      this.db.exec('ALTER TABLE threads RENAME COLUMN autorun TO auto_queue_suggestions')
    }

    // v7: ordered `parts` (reasoning/text/tool) for chronological rendering. Add
    // the column to existing dbs without dropping transcript history; old rows
    // keep `parts_json='[]'` and fall back to text+acts on read.
    const msgCols = (
      this.db.query('PRAGMA table_info(messages)').all() as { name: string }[]
    ).map((c) => c.name)
    if (!msgCols.includes('parts_json')) {
      this.db.exec("ALTER TABLE messages ADD COLUMN parts_json TEXT NOT NULL DEFAULT '[]'")
    }

    // v8: closing a thread now GCs its worktree + branch ref but the file tree
    // is recoverable from a stored commit SHA on rehydrate. Add the column
    // (nullable; null on open threads since the branch tip itself is the
    // snapshot while live, and null on threads that were already closed before
    // this version shipped — they rehydrate as fresh branches off `base_ref`).
    const threadCols7 = (
      this.db.query('PRAGMA table_info(threads)').all() as { name: string }[]
    ).map((c) => c.name)
    if (!threadCols7.includes('last_seen_head')) {
      this.db.exec("ALTER TABLE threads ADD COLUMN last_seen_head TEXT")
    }

    // v9: per-thread agent harness + tab-icon PR state. Both columns are
    // additive (no shape change for existing rows): `harness_id` is nullable
    // so legacy threads fall back to the engine's default picker; `pr_state`
    // is a 4-state enum with a safe `'none'` default so the tab row can render
    // unambiguously. Fresh DBs already have both from CREATE TABLE above.
    const threadCols9 = (
      this.db.query('PRAGMA table_info(threads)').all() as { name: string }[]
    ).map((c) => c.name)
    if (!threadCols9.includes('harness_id')) {
      this.db.exec("ALTER TABLE threads ADD COLUMN harness_id TEXT")
    }
    if (!threadCols9.includes('pr_state')) {
      this.db.exec("ALTER TABLE threads ADD COLUMN pr_state TEXT NOT NULL DEFAULT 'none'")
    }

    // v10: per-thread Freebuff model. Additive + nullable so legacy threads fall
    // back to the engine's recommended default for the user's access tier.
    if (!threadCols9.includes('freebuff_model')) {
      this.db.exec('ALTER TABLE threads ADD COLUMN freebuff_model TEXT')
    }

    this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  }

  // — Projects —

  insertProject(input: NewProjectInput): Project {
    const project: Project = {
      id: input.id,
      repoUrl: input.repoUrl,
      rootPath: input.rootPath,
      defaultBranch: input.defaultBranch ?? 'main',
      runConfig: input.runConfig ?? {},
      mergeStrategy: input.mergeStrategy ?? 'squash',
      createdAt: input.createdAt,
    }
    this.db
      .query(
        `INSERT INTO projects
          (id, repo_url, root_path, default_branch, run_config, merge_strategy,
           created_at)
         VALUES ($id, $repo, $root, $branch, $runConfig, $merge, $created)`,
      )
      .run({
        $id: project.id,
        $repo: project.repoUrl,
        $root: project.rootPath,
        $branch: project.defaultBranch,
        $runConfig: JSON.stringify(project.runConfig),
        $merge: project.mergeStrategy,
        $created: project.createdAt,
      })
    return project
  }

  getProject(id: string): Project | null {
    const row = this.db
      .query('SELECT * FROM projects WHERE id = $id')
      .get({ $id: id }) as ProjectRow | null
    return row ? rowToProject(row) : null
  }

  updateProjectRunConfig(id: string, runConfig: RunConfig): void {
    this.db
      .query('UPDATE projects SET run_config = $rc WHERE id = $id')
      .run({ $id: id, $rc: JSON.stringify(runConfig) })
  }

  // — Threads —

  insertThread(input: NewThreadInput): Thread {
    const thread: Thread = {
      id: input.id,
      projectId: input.projectId,
      title: input.title ?? 'New thread',
      status: input.status ?? 'open',
      harnessId: input.harnessId ?? null,
      freebuffModel: input.freebuffModel ?? null,
      autoQueueSuggestions: input.autoQueueSuggestions ?? false,
      branch: null,
      worktreePath: null,
      baseRef: null,
      lastSeenHead: null,
      prUrl: null,
      prState: 'none',
      turnState: 'idle',
      lastTurnOutcome: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    }
    this.db
      .query(
        `INSERT INTO threads
          (id, project_id, title, status, harness_id, freebuff_model, auto_queue_suggestions, turn_state, created_at, updated_at)
         VALUES ($id, $project, $title, $status, $harness, $freebuffModel, $autoQueue, 'idle', $created, $updated)`,
      )
      .run({
        $id: thread.id,
        $project: thread.projectId,
        $title: thread.title,
        $status: thread.status,
        $harness: thread.harnessId,
        $freebuffModel: thread.freebuffModel,
        $autoQueue: thread.autoQueueSuggestions ? 1 : 0,
        $created: thread.createdAt,
        $updated: thread.updatedAt,
      })
    return thread
  }

  getThread(id: ThreadId): Thread | null {
    const row = this.db
      .query('SELECT * FROM threads WHERE id = $id')
      .get({ $id: id }) as ThreadRow | null
    return row ? rowToThread(row) : null
  }

  /** Threads for a project in creation order. */
  listThreads(projectId: string, opts?: { status?: ThreadStatus }): Thread[] {
    const rows = (
      opts?.status
        ? this.db
            .query(
              `SELECT * FROM threads WHERE project_id = $p AND status = $s
               ORDER BY created_at ASC`,
            )
            .all({ $p: projectId, $s: opts.status })
        : this.db
            .query(`SELECT * FROM threads WHERE project_id = $p ORDER BY created_at ASC`)
            .all({ $p: projectId })
    ) as ThreadRow[]
    return rows.map(rowToThread)
  }

  updateThread(id: ThreadId, patch: ThreadPatch, now: number): void {
    const upd = buildUpdate('threads', id, patch, now, ['autoQueueSuggestions'])
    if (upd) this.db.query(upd.sql).run(upd.params)
  }

  deleteThread(id: ThreadId): void {
    this.db.query('DELETE FROM threads WHERE id = $id').run({ $id: id })
  }

  // — Messages —

  appendMessage(
    threadId: ThreadId,
    msg: { role: string; text: string; acts?: unknown[]; parts?: Part[] },
    ts: number,
  ): void {
    this.db
      .query(
        `INSERT INTO messages (thread_id, role, text, acts_json, parts_json, ts)
         VALUES ($t, $role, $text, $acts, $parts, $ts)`,
      )
      .run({
        $t: threadId,
        $role: msg.role,
        $text: msg.text,
        $acts: JSON.stringify(msg.acts ?? []),
        $parts: JSON.stringify(msg.parts ?? []),
        $ts: ts,
      })
  }

  getMessages(threadId: ThreadId): { role: string; text: string; acts: unknown[]; parts: Part[] }[] {
    const rows = this.db
      .query(
        `SELECT role, text, acts_json, parts_json FROM messages WHERE thread_id = $t ORDER BY seq ASC`,
      )
      .all({ $t: threadId }) as {
      role: string
      text: string
      acts_json: string
      parts_json: string
    }[]
    return rows.map((r) => ({
      role: r.role,
      text: r.text,
      acts: JSON.parse(r.acts_json) as unknown[],
      parts: JSON.parse(r.parts_json) as Part[],
    }))
  }

  // — Queue items (unified queue + suggestions) —

  insertQueueItem(input: NewQueueItemInput): QueueItem {
    const item: QueueItem = {
      id: input.id,
      threadId: input.threadId,
      prompt: input.prompt,
      label: input.label ?? null,
      state: input.state,
      source: input.source,
      skillName: input.skillName ?? null,
      workflowRunId: input.workflowRunId ?? null,
      workflowName: input.workflowName ?? null,
      position: input.position,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    }
    this.db
      .query(
        `INSERT INTO queue_items
          (id, thread_id, prompt, label, state, source, skill_name,
           workflow_run_id, workflow_name, position, created_at, updated_at)
         VALUES ($id, $thread, $prompt, $label, $state, $source, $skill,
           $wfRun, $wfName, $pos, $created, $updated)`,
      )
      .run({
        $id: item.id,
        $thread: item.threadId,
        $prompt: item.prompt,
        $label: item.label,
        $state: item.state,
        $source: item.source,
        $skill: item.skillName,
        $wfRun: item.workflowRunId,
        $wfName: item.workflowName,
        $pos: item.position,
        $created: item.createdAt,
        $updated: item.updatedAt,
      })
    return item
  }

  getQueueItem(id: string): QueueItem | null {
    const row = this.db
      .query('SELECT * FROM queue_items WHERE id = $id')
      .get({ $id: id }) as QueueRow | null
    return row ? rowToQueueItem(row) : null
  }

  /** Items for a thread, ordered by position. Optionally filtered to one lane. */
  listQueueItems(threadId: ThreadId, state?: QueueItemState): QueueItem[] {
    const rows = (
      state
        ? this.db
            .query(
              `SELECT * FROM queue_items WHERE thread_id = $t AND state = $s
               ORDER BY position ASC`,
            )
            .all({ $t: threadId, $s: state })
        : this.db
            .query(`SELECT * FROM queue_items WHERE thread_id = $t ORDER BY position ASC`)
            .all({ $t: threadId })
    ) as QueueRow[]
    return rows.map(rowToQueueItem)
  }

  updateQueueItem(id: string, patch: QueueItemPatch, now: number): void {
    const upd = buildUpdate('queue_items', id, patch, now)
    if (upd) this.db.query(upd.sql).run(upd.params)
  }

  deleteQueueItem(id: string): void {
    this.db.query('DELETE FROM queue_items WHERE id = $id').run({ $id: id })
  }

  /** The next item to run: lowest-position `queued` item for the thread. */
  nextQueuedItem(threadId: ThreadId): QueueItem | null {
    const row = this.db
      .query(
        `SELECT * FROM queue_items WHERE thread_id = $t AND state = 'queued'
         ORDER BY position ASC LIMIT 1`,
      )
      .get({ $t: threadId }) as QueueRow | null
    return row ? rowToQueueItem(row) : null
  }

  /** Highest position in a lane (for appending). Returns 0 when the lane is empty. */
  maxPosition(threadId: ThreadId, state: QueueItemState): number {
    const row = this.db
      .query(
        `SELECT MAX(position) AS m FROM queue_items WHERE thread_id = $t AND state = $s`,
      )
      .get({ $t: threadId, $s: state }) as { m: number | null }
    return row.m ?? 0
  }

  // — Workflows —

  upsertWorkflow(projectId: string, name: string, skills: string[]): void {
    this.db
      .query(
        `INSERT INTO workflows (project_id, name, skills_json) VALUES ($p, $n, $s)
         ON CONFLICT(project_id, name) DO UPDATE SET skills_json = excluded.skills_json`,
      )
      .run({ $p: projectId, $n: name, $s: JSON.stringify(skills) })
  }

  getWorkflow(projectId: string, name: string): Workflow | null {
    const row = this.db
      .query('SELECT name, skills_json FROM workflows WHERE project_id = $p AND name = $n')
      .get({ $p: projectId, $n: name }) as { name: string; skills_json: string } | null
    return row ? { name: row.name, skills: JSON.parse(row.skills_json) as string[] } : null
  }

  listWorkflows(projectId: string): Workflow[] {
    const rows = this.db
      .query('SELECT name, skills_json FROM workflows WHERE project_id = $p ORDER BY name ASC')
      .all({ $p: projectId }) as { name: string; skills_json: string }[]
    return rows.map((r) => ({ name: r.name, skills: JSON.parse(r.skills_json) as string[] }))
  }
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    repoUrl: row.repo_url,
    rootPath: row.root_path,
    defaultBranch: row.default_branch,
    runConfig: JSON.parse(row.run_config) as RunConfig,
    mergeStrategy: row.merge_strategy,
    createdAt: row.created_at,
  }
}

function rowToThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    status: row.status,
    harnessId: row.harness_id,
    freebuffModel: row.freebuff_model ?? null,
    autoQueueSuggestions: row.auto_queue_suggestions === 1,
    branch: row.branch,
    worktreePath: row.worktree_path,
    baseRef: row.base_ref,
    lastSeenHead: row.last_seen_head,
    prUrl: row.pr_url,
    prState: row.pr_state ?? 'none',
    turnState: row.turn_state,
    lastTurnOutcome: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToQueueItem(row: QueueRow): QueueItem {
  return {
    id: row.id,
    threadId: row.thread_id,
    prompt: row.prompt,
    label: row.label,
    state: row.state,
    source: row.source,
    skillName: row.skill_name,
    workflowRunId: row.workflow_run_id,
    workflowName: row.workflow_name,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
