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
const SCHEMA_VERSION = 15

const toSnake = (key: string): string => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

/**
 * Parse a JSON column, returning `fallback` if it's malformed. The DB lives in
 * the repo (`.freebuff/desktop.db`) and is user-editable, so a single corrupt
 * `parts_json`/`acts_json`/`skills_json`/`run_config` value must not blow up the
 * whole transcript / workflow list / project load — it degrades to the default.
 */
function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (json == null) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

/**
 * Build an `UPDATE … SET col = $col, …, updated_at = $updated WHERE id = $id`
 * from a typed patch, mapping camelCase keys to snake_case columns. `boolKeys`
 * are coerced to 0/1. Returns null when the patch is empty.
 *
 * `allowed` is the set of permitted camelCase keys for this table: an unknown key
 * throws rather than silently emitting `SET nonexistent_col = …` (the TS patch
 * types erase at runtime, so this is the only guard against a stray/typo'd key).
 */
function buildUpdate(
  table: string,
  id: string,
  patch: Record<string, unknown>,
  now: number,
  opts: { allowed: readonly string[]; boolKeys?: readonly string[] },
): { sql: string; params: Record<string, string | number | null> } | null {
  const { allowed, boolKeys = [] } = opts
  const sets: string[] = []
  const params: Record<string, string | number | null> = { $id: id, $updated: now }
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.includes(key)) {
      throw new Error(`buildUpdate(${table}): refusing unknown column for key "${key}"`)
    }
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
  /** Absolute path of the repo this thread runs in (the engine's root). */
  projectPath: string
  title?: string
  status?: ThreadStatus
  /** Per-thread agent selection. Null means "use the engine's default". */
  harnessId?: HarnessId | null
  /** Per-thread Freebuff model. Null means "use the recommended default". */
  freebuffModel?: string | null
  /** Per-thread Claude model. Null means "use the default (Opus 4.8)". */
  claudeModel?: string | null
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
    | 'claudeModel'
    | 'autoQueueSuggestions'
    | 'branch'
    | 'worktreePath'
    | 'baseRef'
    | 'lastSeenHead'
    | 'prUrl'
    | 'prNumber'
    | 'prState'
    | 'turnState'
    | 'lastPromptAt'
  >
>

export type QueueItemPatch = Partial<
  Pick<
    QueueItem,
    'prompt' | 'label' | 'state' | 'source' | 'skillName' | 'workflowRunId' | 'workflowName' | 'position'
  >
>

// Runtime allowlists for buildUpdate, kept honest by `satisfies` so a typo or a
// key that isn't a real patch field is a compile error.
const THREAD_PATCH_KEYS = [
  'title',
  'status',
  'harnessId',
  'freebuffModel',
  'claudeModel',
  'autoQueueSuggestions',
  'branch',
  'worktreePath',
  'baseRef',
  'lastSeenHead',
  'prUrl',
  'prNumber',
  'prState',
  'turnState',
  'lastPromptAt',
] as const satisfies readonly (keyof ThreadPatch)[]

const QUEUE_PATCH_KEYS = [
  'prompt',
  'label',
  'state',
  'source',
  'skillName',
  'workflowRunId',
  'workflowName',
  'position',
] as const satisfies readonly (keyof QueueItemPatch)[]

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
  project_path: string | null
  title: string
  status: ThreadStatus
  /** Per-thread agent (Codebuff/Claude Code). Mirrors Thread.harnessId. Null
   *  means the engine's default applies. */
  harness_id: HarnessId | null
  freebuff_model: string | null
  claude_model: string | null
  auto_queue_suggestions: number
  branch: string | null
  worktree_path: string | null
  base_ref: string | null
  last_seen_head: string | null
  pr_url: string | null
  pr_number: number | null
  pr_state: Thread['prState']
  turn_state: TurnState
  last_prompt_at: number | null
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

  /** Whether `table` currently has `column`. Queried FRESH each call (not from a
   *  cached `table_info` snapshot) so additive migration steps can't read a stale
   *  column list after an intervening `ALTER`. Table names here are internal
   *  literals, never user input. */
  private hasColumn(table: string, column: string): boolean {
    const rows = this.db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]
    return rows.some((c) => c.name === column)
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
        -- Absolute path of the git repo this thread (tab) runs in. Equals the
        -- engine's project root; persisted so every thread is self-describing in
        -- a multi-project app (one engine per repo). Backfilled for legacy rows.
        project_path  TEXT,
        title         TEXT NOT NULL DEFAULT 'New thread',
        status        TEXT NOT NULL DEFAULT 'open',
        harness_id    TEXT,
        freebuff_model TEXT,
        claude_model  TEXT,
        auto_queue_suggestions INTEGER NOT NULL DEFAULT 0,
        branch        TEXT,
        worktree_path TEXT,
        base_ref      TEXT,
        last_seen_head TEXT,
        pr_url        TEXT,
        pr_number     INTEGER,
        pr_state      TEXT NOT NULL DEFAULT 'none',
        turn_state    TEXT NOT NULL DEFAULT 'idle',
        last_prompt_at INTEGER,
        -- Engine-internal recovery columns (not part of the Thread domain type):
        -- the agent's carried context (Codebuff RunState / Claude session id) so
        -- a turn after an app restart keeps the conversation, plus the prompt of a
        -- typed turn that was in flight at quit so it can be re-run on relaunch,
        -- plus the server-side Freebuff desktop instance id for this tab.
        harness_state    TEXT,
        harness_state_id TEXT,
        pending_prompt   TEXT,
        freebuff_instance_id TEXT,
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
    if (this.hasColumn('projects', 'daily_budget')) {
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
    if (this.hasColumn('threads', 'autorun') && !this.hasColumn('threads', 'auto_queue_suggestions')) {
      this.db.exec('ALTER TABLE threads RENAME COLUMN autorun TO auto_queue_suggestions')
    }

    // v7: ordered `parts` (reasoning/text/tool) for chronological rendering. Add
    // the column to existing dbs without dropping transcript history; old rows
    // keep `parts_json='[]'` and fall back to text+acts on read.
    if (!this.hasColumn('messages', 'parts_json')) {
      this.db.exec("ALTER TABLE messages ADD COLUMN parts_json TEXT NOT NULL DEFAULT '[]'")
    }

    // v8: closing a thread now GCs its worktree + branch ref but the file tree
    // is recoverable from a stored commit SHA on rehydrate. Add the column
    // (nullable; null on open threads since the branch tip itself is the
    // snapshot while live, and null on threads that were already closed before
    // this version shipped — they rehydrate as fresh branches off `base_ref`).
    if (!this.hasColumn('threads', 'last_seen_head')) {
      this.db.exec("ALTER TABLE threads ADD COLUMN last_seen_head TEXT")
    }

    // v9: per-thread agent harness + tab-icon PR state. Both columns are
    // additive (no shape change for existing rows): `harness_id` is nullable
    // so legacy threads fall back to the engine's default picker; `pr_state`
    // is a 4-state enum with a safe `'none'` default so the tab row can render
    // unambiguously. Fresh DBs already have both from CREATE TABLE above.
    if (!this.hasColumn('threads', 'harness_id')) {
      this.db.exec("ALTER TABLE threads ADD COLUMN harness_id TEXT")
    }
    if (!this.hasColumn('threads', 'pr_state')) {
      this.db.exec("ALTER TABLE threads ADD COLUMN pr_state TEXT NOT NULL DEFAULT 'none'")
    }

    // v10: per-thread Freebuff model. Additive + nullable so legacy threads fall
    // back to the engine's recommended default for the user's access tier.
    if (!this.hasColumn('threads', 'freebuff_model')) {
      this.db.exec('ALTER TABLE threads ADD COLUMN freebuff_model TEXT')
    }

    // v11: persist the agent's carried context + an in-flight typed prompt so
    // closing the app no longer drops a running turn's conversation. All three
    // are additive + nullable: legacy threads simply start the next turn fresh
    // (the prior behaviour) until a turn writes its state.
    if (!this.hasColumn('threads', 'harness_state')) {
      this.db.exec('ALTER TABLE threads ADD COLUMN harness_state TEXT')
    }
    if (!this.hasColumn('threads', 'harness_state_id')) {
      this.db.exec('ALTER TABLE threads ADD COLUMN harness_state_id TEXT')
    }
    if (!this.hasColumn('threads', 'pending_prompt')) {
      this.db.exec('ALTER TABLE threads ADD COLUMN pending_prompt TEXT')
    }

    // v12: per-thread project path so each tab can run in a different repo.
    // Additive + nullable; backfill legacy rows from the (single) project root
    // this DB belongs to, so existing tabs keep showing their folder.
    if (!this.hasColumn('threads', 'project_path')) {
      this.db.exec('ALTER TABLE threads ADD COLUMN project_path TEXT')
      this.db.exec(
        'UPDATE threads SET project_path = (SELECT root_path FROM projects LIMIT 1) WHERE project_path IS NULL',
      )
    }

    // v13: per-thread Claude model (the Claude Code harness used to be pinned to
    // Opus). Additive + nullable so legacy threads fall back to the default.
    if (!this.hasColumn('threads', 'claude_model')) {
      this.db.exec('ALTER TABLE threads ADD COLUMN claude_model TEXT')
    }

    // v14: stable Freebuff desktop instance id per tab. The backend uses this
    // to reclaim an existing session after app restart instead of treating the
    // tab as a second premium-bucket holder.
    if (!this.hasColumn('threads', 'freebuff_instance_id')) {
      this.db.exec('ALTER TABLE threads ADD COLUMN freebuff_instance_id TEXT')
    }

    // v15: richer tab-status data. `pr_number` + `last_prompt_at` are additive +
    // nullable (legacy rows show a bare PR icon / no elapsed readout until the
    // next `gh pr view` refresh / turn fills them in). `pr_state` also gains a
    // 'conflict' value — no column change, old rows keep their 4-state values.
    if (!this.hasColumn('threads', 'pr_number')) {
      this.db.exec('ALTER TABLE threads ADD COLUMN pr_number INTEGER')
    }
    if (!this.hasColumn('threads', 'last_prompt_at')) {
      this.db.exec('ALTER TABLE threads ADD COLUMN last_prompt_at INTEGER')
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
      projectPath: input.projectPath,
      title: input.title ?? 'New thread',
      status: input.status ?? 'open',
      harnessId: input.harnessId ?? null,
      freebuffModel: input.freebuffModel ?? null,
      claudeModel: input.claudeModel ?? null,
      autoQueueSuggestions: input.autoQueueSuggestions ?? false,
      branch: null,
      worktreePath: null,
      baseRef: null,
      lastSeenHead: null,
      prUrl: null,
      prNumber: null,
      prState: 'none',
      turnState: 'idle',
      lastPromptAt: null,
      lastTurnOutcome: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    }
    this.db
      .query(
        `INSERT INTO threads
          (id, project_id, project_path, title, status, harness_id, freebuff_model, claude_model, auto_queue_suggestions, turn_state, created_at, updated_at)
         VALUES ($id, $project, $projectPath, $title, $status, $harness, $freebuffModel, $claudeModel, $autoQueue, 'idle', $created, $updated)`,
      )
      .run({
        $id: thread.id,
        $project: thread.projectId,
        $projectPath: thread.projectPath,
        $title: thread.title,
        $status: thread.status,
        $harness: thread.harnessId,
        $freebuffModel: thread.freebuffModel,
        $claudeModel: thread.claudeModel,
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

  /** Set `project_path` on any thread that's missing it (NULL/empty) to `rootPath`.
   *  Every thread in a per-repo DB belongs to that repo, so this is always safe. */
  backfillThreadProjectPath(rootPath: string): void {
    this.db
      .query("UPDATE threads SET project_path = $p WHERE project_path IS NULL OR project_path = ''")
      .run({ $p: rootPath })
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
    const upd = buildUpdate('threads', id, patch, now, {
      allowed: THREAD_PATCH_KEYS,
      boolKeys: ['autoQueueSuggestions'],
    })
    if (upd) this.db.query(upd.sql).run(upd.params)
  }

  deleteThread(id: ThreadId): void {
    this.db.query('DELETE FROM threads WHERE id = $id').run({ $id: id })
  }

  // — Crash-recovery state (engine-internal; kept off the Thread domain type) —

  /**
   * Persist the agent's carried context for a thread (the opaque harness state,
   * already JSON-serialized) tagged with the harness that produced it, so the
   * next turn after an app restart resumes the conversation instead of starting
   * blank. Tagging lets a mid-thread agent switch ignore foreign state.
   */
  setHarnessState(threadId: ThreadId, harnessId: string, stateJson: string): void {
    this.db
      .query('UPDATE threads SET harness_state = $s, harness_state_id = $h WHERE id = $id')
      .run({ $id: threadId, $s: stateJson, $h: harnessId })
  }

  clearHarnessState(threadId: ThreadId): void {
    this.db
      .query('UPDATE threads SET harness_state = NULL, harness_state_id = NULL WHERE id = $id')
      .run({ $id: threadId })
  }

  /** The persisted harness state for a thread, or null if none/incomplete. */
  getHarnessState(threadId: ThreadId): { harnessId: string; stateJson: string } | null {
    const row = this.db
      .query('SELECT harness_state, harness_state_id FROM threads WHERE id = $id')
      .get({ $id: threadId }) as
      | { harness_state: string | null; harness_state_id: string | null }
      | null
    if (!row || row.harness_state == null || row.harness_state_id == null) return null
    return { harnessId: row.harness_state_id, stateJson: row.harness_state }
  }

  /** The prompt of a typed turn that was in flight (null = no pending turn). Set
   *  while a non-queued turn runs so it can be re-run after a crash/quit. */
  setPendingPrompt(threadId: ThreadId, prompt: string | null): void {
    this.db
      .query('UPDATE threads SET pending_prompt = $p WHERE id = $id')
      .run({ $id: threadId, $p: prompt })
  }

  getPendingPrompt(threadId: ThreadId): string | null {
    const row = this.db
      .query('SELECT pending_prompt FROM threads WHERE id = $id')
      .get({ $id: threadId }) as { pending_prompt: string | null } | null
    return row?.pending_prompt ?? null
  }

  /** Stable server-side Freebuff desktop session id for this tab. Kept off the
   *  public Thread type because it is an implementation detail, but persisted so
   *  a relaunched app can reclaim the same backend row. */
  setFreebuffInstanceId(threadId: ThreadId, instanceId: string | null): void {
    this.db
      .query('UPDATE threads SET freebuff_instance_id = $i WHERE id = $id')
      .run({ $id: threadId, $i: instanceId })
  }

  getFreebuffInstanceId(threadId: ThreadId): string | null {
    const row = this.db
      .query('SELECT freebuff_instance_id FROM threads WHERE id = $id')
      .get({ $id: threadId }) as { freebuff_instance_id: string | null } | null
    return row?.freebuff_instance_id ?? null
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

  /** Whether any transcript rows exist for a thread (cheap LIMIT-1 probe —
   *  used for the "thread has started" check without loading the transcript). */
  hasMessages(threadId: ThreadId): boolean {
    return !!this.db
      .query('SELECT 1 FROM messages WHERE thread_id = $t LIMIT 1')
      .get({ $t: threadId })
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
      acts: safeParse<unknown[]>(r.acts_json, []),
      parts: safeParse<Part[]>(r.parts_json, []),
    }))
  }

  /** The last `limit` messages in transcript order. A cheap LIMIT query for
   *  tail-only readers (the per-turn ad gate/targeting) so they don't load and
   *  JSON-parse the whole transcript; `acts_json` is skipped for the same
   *  reason. */
  getRecentMessages(
    threadId: ThreadId,
    limit: number,
  ): { role: string; text: string; parts: Part[] }[] {
    const rows = this.db
      .query(
        `SELECT role, text, parts_json FROM messages WHERE thread_id = $t
         ORDER BY seq DESC LIMIT $n`,
      )
      .all({ $t: threadId, $n: limit }) as {
      role: string
      text: string
      parts_json: string
    }[]
    return rows.reverse().map((r) => ({
      role: r.role,
      text: r.text,
      parts: safeParse<Part[]>(r.parts_json, []),
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
    const upd = buildUpdate('queue_items', id, patch, now, { allowed: QUEUE_PATCH_KEYS })
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
    return row ? { name: row.name, skills: safeParse<string[]>(row.skills_json, []) } : null
  }

  listWorkflows(projectId: string): Workflow[] {
    const rows = this.db
      .query('SELECT name, skills_json FROM workflows WHERE project_id = $p ORDER BY name ASC')
      .all({ $p: projectId }) as { name: string; skills_json: string }[]
    return rows.map((r) => ({ name: r.name, skills: safeParse<string[]>(r.skills_json, []) }))
  }
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    repoUrl: row.repo_url,
    rootPath: row.root_path,
    defaultBranch: row.default_branch,
    runConfig: safeParse<RunConfig>(row.run_config, {}),
    mergeStrategy: row.merge_strategy,
    createdAt: row.created_at,
  }
}

function rowToThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    projectId: row.project_id,
    projectPath: row.project_path ?? '',
    title: row.title,
    status: row.status,
    harnessId: row.harness_id,
    freebuffModel: row.freebuff_model ?? null,
    claudeModel: row.claude_model ?? null,
    autoQueueSuggestions: row.auto_queue_suggestions === 1,
    branch: row.branch,
    worktreePath: row.worktree_path,
    baseRef: row.base_ref,
    lastSeenHead: row.last_seen_head,
    prUrl: row.pr_url,
    prNumber: row.pr_number ?? null,
    prState: row.pr_state ?? 'none',
    turnState: row.turn_state,
    lastPromptAt: row.last_prompt_at ?? null,
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
