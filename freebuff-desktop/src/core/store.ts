/**
 * Local-first persistence for a single project (§14).
 *
 * One SQLite database per project, living under `<project>/.freebuff/desktop.db`,
 * so a project is portable with its repo. Governing docs are NOT rows — they are
 * markdown files under `.freebuff/docs/` (§14) and handled by the doc store.
 *
 * Uses `bun:sqlite` (built into the Bun runtime the orchestrator process runs on).
 */

import { Database } from 'bun:sqlite'

import type {
  BudgetLedger,
  DependencyEdge,
  MergeStrategy,
  Project,
  RunConfig,
  Task,
  TaskId,
  TaskOrigin,
  TaskStatus,
  PipelineStage,
} from './types'

/** Bump when the schema changes; `migrate()` applies steps past the current version. */
const SCHEMA_VERSION = 2

/** camelCase task field → snake_case column, for the dynamic `updateTask` patch. */
const TASK_UPDATE_COLUMNS: Record<string, string> = {
  title: 'title',
  description: 'description',
  status: 'status',
  branch: 'branch',
  worktreePath: 'worktree_path',
  prUrl: 'pr_url',
  lastCompletedStage: 'last_completed_stage',
  stage: 'stage',
  rationale: 'rationale',
  reviewRetries: 'review_retries',
  changesRequestedRounds: 'changes_requested_rounds',
}

export interface NewTaskInput {
  id: TaskId
  projectId: string
  title: string
  description: string
  parents?: TaskId[]
  origin: TaskOrigin
  rationale?: string | null
  /** Defaults to `proposed`; human-seeded tasks may enter as `ready`. */
  status?: TaskStatus
  createdAt: number
}

export interface NewProjectInput {
  id: string
  repoUrl: string
  rootPath: string
  defaultBranch?: string
  runConfig?: RunConfig
  mergeStrategy?: MergeStrategy
  dailyBudget: number
  concurrencyCap: number
  createdAt: number
}

type TaskRow = {
  id: string
  project_id: string
  created_at: number
  title: string
  description: string
  status: TaskStatus
  branch: string | null
  worktree_path: string | null
  pr_url: string | null
  last_completed_stage: PipelineStage | null
  stage: PipelineStage | null
  origin: TaskOrigin
  rationale: string | null
  review_retries: number
  changes_requested_rounds: number
  updated_at: number
}

type ProjectRow = {
  id: string
  repo_url: string
  root_path: string
  default_branch: string
  run_config: string
  merge_strategy: MergeStrategy
  daily_budget: number
  concurrency_cap: number
  created_at: number
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

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id               TEXT PRIMARY KEY,
        repo_url         TEXT NOT NULL,
        root_path        TEXT NOT NULL,
        default_branch   TEXT NOT NULL DEFAULT 'main',
        run_config       TEXT NOT NULL DEFAULT '{}',
        merge_strategy   TEXT NOT NULL DEFAULT 'squash',
        daily_budget     INTEGER NOT NULL,
        concurrency_cap  INTEGER NOT NULL,
        created_at       INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id                       TEXT PRIMARY KEY,
        project_id               TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        created_at               INTEGER NOT NULL,
        title                    TEXT NOT NULL,
        description              TEXT NOT NULL,
        status                   TEXT NOT NULL DEFAULT 'proposed',
        branch                   TEXT,
        worktree_path            TEXT,
        pr_url                   TEXT,
        last_completed_stage     TEXT,
        stage                    TEXT,
        origin                   TEXT NOT NULL,
        rationale                TEXT,
        review_retries           INTEGER NOT NULL DEFAULT 0,
        changes_requested_rounds INTEGER NOT NULL DEFAULT 0,
        updated_at               INTEGER NOT NULL
      );
      -- FIFO scheduling (§17) reads tasks in creation order.
      CREATE INDEX IF NOT EXISTS idx_tasks_project_created
        ON tasks(project_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

      -- Dependency edges (§8). "to depends on from": to waits for from to merge.
      CREATE TABLE IF NOT EXISTS dependency_edges (
        from_task  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        to_task    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        PRIMARY KEY (from_task, to_task)
      );
      CREATE INDEX IF NOT EXISTS idx_edges_to ON dependency_edges(to_task);
      CREATE INDEX IF NOT EXISTS idx_edges_from ON dependency_edges(from_task);

      -- Rolling-24h token budget per Freebuff account (§13).
      CREATE TABLE IF NOT EXISTS budget_ledger (
        account_id   TEXT PRIMARY KEY,
        tokens_used  INTEGER NOT NULL DEFAULT 0,
        window_start INTEGER NOT NULL
      );

      -- Orchestrator chat transcript, persisted per project so it survives reloads
      -- and app restarts (the conversation is real work, not throwaway).
      CREATE TABLE IF NOT EXISTS chat_messages (
        seq        INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        role       TEXT NOT NULL,
        text       TEXT NOT NULL DEFAULT '',
        acts_json  TEXT NOT NULL DEFAULT '[]',
        ts         INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chat_project ON chat_messages(project_id, seq);

      -- Per-task pipeline artifacts surfaced on the PR (§7): diff, test evidence,
      -- review notes, transcript. Keyed blobs rather than columns so stages can
      -- attach freely.
      CREATE TABLE IF NOT EXISTS task_artifacts (
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        key     TEXT NOT NULL,
        value   TEXT NOT NULL,
        PRIMARY KEY (task_id, key)
      );
    `)
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
      dailyBudget: input.dailyBudget,
      concurrencyCap: input.concurrencyCap,
      createdAt: input.createdAt,
    }
    this.db
      .query(
        `INSERT INTO projects
          (id, repo_url, root_path, default_branch, run_config, merge_strategy,
           daily_budget, concurrency_cap, created_at)
         VALUES ($id, $repo, $root, $branch, $runConfig, $merge, $budget, $cap, $created)`,
      )
      .run({
        $id: project.id,
        $repo: project.repoUrl,
        $root: project.rootPath,
        $branch: project.defaultBranch,
        $runConfig: JSON.stringify(project.runConfig),
        $merge: project.mergeStrategy,
        $budget: project.dailyBudget,
        $cap: project.concurrencyCap,
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

  // — Tasks —

  insertTask(input: NewTaskInput): Task {
    const parents = input.parents ?? []
    const task: Task = {
      id: input.id,
      projectId: input.projectId,
      createdAt: input.createdAt,
      title: input.title,
      description: input.description,
      status: input.status ?? 'proposed',
      parents,
      branch: null,
      worktreePath: null,
      prUrl: null,
      lastCompletedStage: null,
      stage: null,
      origin: input.origin,
      rationale: input.rationale ?? null,
      reviewRetries: 0,
      changesRequestedRounds: 0,
      updatedAt: input.createdAt,
    }

    this.db.transaction(() => {
      this.db
        .query(
          `INSERT INTO tasks
            (id, project_id, created_at, title, description, status, origin,
             rationale, updated_at)
           VALUES ($id, $project, $created, $title, $desc, $status, $origin,
             $rationale, $updated)`,
        )
        .run({
          $id: task.id,
          $project: task.projectId,
          $created: task.createdAt,
          $title: task.title,
          $desc: task.description,
          $status: task.status,
          $origin: task.origin,
          $rationale: task.rationale,
          $updated: task.updatedAt,
        })
      for (const parent of parents) {
        this.insertEdge({ from: parent, to: task.id })
      }
    })()

    return task
  }

  getTask(id: TaskId): Task | null {
    const row = this.db
      .query('SELECT * FROM tasks WHERE id = $id')
      .get({ $id: id }) as TaskRow | null
    if (!row) return null
    return rowToTask(row, this.parentsOf(id))
  }

  /** All tasks for a project in FIFO (creation) order (§17). */
  listTasks(projectId: string, status?: TaskStatus): Task[] {
    const rows = (
      status
        ? this.db
            .query(
              `SELECT * FROM tasks WHERE project_id = $p AND status = $s
               ORDER BY created_at ASC`,
            )
            .all({ $p: projectId, $s: status })
        : this.db
            .query(
              `SELECT * FROM tasks WHERE project_id = $p ORDER BY created_at ASC`,
            )
            .all({ $p: projectId })
    ) as TaskRow[]
    // Batch all parent edges in one query (avoid an N+1 parentsOf() per row).
    const parentsByTask = new Map<TaskId, TaskId[]>()
    for (const e of this.allEdges(projectId)) {
      const list = parentsByTask.get(e.to)
      if (list) list.push(e.from)
      else parentsByTask.set(e.to, [e.from])
    }
    return rows.map((r) => rowToTask(r, parentsByTask.get(r.id) ?? []))
  }

  /** Patch a subset of task columns. `parents` is managed via edges, not here. */
  updateTask(
    id: TaskId,
    patch: Partial<
      Pick<
        Task,
        | 'title'
        | 'description'
        | 'status'
        | 'branch'
        | 'worktreePath'
        | 'prUrl'
        | 'lastCompletedStage'
        | 'stage'
        | 'rationale'
        | 'reviewRetries'
        | 'changesRequestedRounds'
      >
    >,
    now: number,
  ): void {
    const sets: string[] = []
    const params: Record<string, string | number | null> = {
      $id: id,
      $updated: now,
    }
    for (const [key, value] of Object.entries(patch)) {
      sets.push(`${TASK_UPDATE_COLUMNS[key]} = $${key}`)
      params[`$${key}`] = value as string | number | null
    }
    if (sets.length === 0) return
    this.db
      .query(
        `UPDATE tasks SET ${sets.join(', ')}, updated_at = $updated WHERE id = $id`,
      )
      .run(params)
  }

  // — Dependency edges —

  insertEdge(edge: DependencyEdge): void {
    this.db
      .query(
        `INSERT OR IGNORE INTO dependency_edges (from_task, to_task)
         VALUES ($from, $to)`,
      )
      .run({ $from: edge.from, $to: edge.to })
  }

  removeEdge(edge: DependencyEdge): void {
    this.db
      .query(
        `DELETE FROM dependency_edges WHERE from_task = $from AND to_task = $to`,
      )
      .run({ $from: edge.from, $to: edge.to })
  }

  /** Parents of a task (the `from` side of edges pointing at it). */
  parentsOf(taskId: TaskId): TaskId[] {
    const rows = this.db
      .query('SELECT from_task FROM dependency_edges WHERE to_task = $id')
      .all({ $id: taskId }) as { from_task: string }[]
    return rows.map((r) => r.from_task)
  }

  /** Children that depend on a task (the `to` side of edges from it). */
  childrenOf(taskId: TaskId): TaskId[] {
    const rows = this.db
      .query('SELECT to_task FROM dependency_edges WHERE from_task = $id')
      .all({ $id: taskId }) as { to_task: string }[]
    return rows.map((r) => r.to_task)
  }

  allEdges(projectId: string): DependencyEdge[] {
    const rows = this.db
      .query(
        `SELECT e.from_task, e.to_task FROM dependency_edges e
         JOIN tasks t ON t.id = e.to_task
         WHERE t.project_id = $p`,
      )
      .all({ $p: projectId }) as { from_task: string; to_task: string }[]
    return rows.map((r) => ({ from: r.from_task, to: r.to_task }))
  }

  // — Chat transcript —

  appendChatMessage(
    projectId: string,
    msg: { role: string; text: string; acts?: unknown[] },
    ts: number,
  ): void {
    this.db
      .query(
        `INSERT INTO chat_messages (project_id, role, text, acts_json, ts)
         VALUES ($p, $role, $text, $acts, $ts)`,
      )
      .run({
        $p: projectId,
        $role: msg.role,
        $text: msg.text,
        $acts: JSON.stringify(msg.acts ?? []),
        $ts: ts,
      })
  }

  getChatMessages(
    projectId: string,
  ): { role: string; text: string; acts: unknown[] }[] {
    const rows = this.db
      .query(
        `SELECT role, text, acts_json FROM chat_messages
         WHERE project_id = $p ORDER BY seq ASC`,
      )
      .all({ $p: projectId }) as { role: string; text: string; acts_json: string }[]
    return rows.map((r) => ({
      role: r.role,
      text: r.text,
      acts: JSON.parse(r.acts_json) as unknown[],
    }))
  }

  // — Task artifacts —

  setArtifact(taskId: TaskId, key: string, value: string): void {
    this.db
      .query(
        `INSERT INTO task_artifacts (task_id, key, value) VALUES ($t, $k, $v)
         ON CONFLICT(task_id, key) DO UPDATE SET value = excluded.value`,
      )
      .run({ $t: taskId, $k: key, $v: value })
  }

  getArtifacts(taskId: TaskId): Record<string, string> {
    const rows = this.db
      .query('SELECT key, value FROM task_artifacts WHERE task_id = $t')
      .all({ $t: taskId }) as { key: string; value: string }[]
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  }

  // — Budget ledger —

  getBudget(accountId: string): BudgetLedger | null {
    const row = this.db
      .query('SELECT * FROM budget_ledger WHERE account_id = $id')
      .get({ $id: accountId }) as
      | { account_id: string; tokens_used: number; window_start: number }
      | null
    return row
      ? {
          accountId: row.account_id,
          tokensUsed: row.tokens_used,
          windowStart: row.window_start,
        }
      : null
  }

  upsertBudget(ledger: BudgetLedger): void {
    this.db
      .query(
        `INSERT INTO budget_ledger (account_id, tokens_used, window_start)
         VALUES ($id, $used, $start)
         ON CONFLICT(account_id) DO UPDATE SET
           tokens_used = excluded.tokens_used,
           window_start = excluded.window_start`,
      )
      .run({
        $id: ledger.accountId,
        $used: ledger.tokensUsed,
        $start: ledger.windowStart,
      })
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
    dailyBudget: row.daily_budget,
    concurrencyCap: row.concurrency_cap,
    createdAt: row.created_at,
  }
}

function rowToTask(row: TaskRow, parents: TaskId[]): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    createdAt: row.created_at,
    title: row.title,
    description: row.description,
    status: row.status,
    parents,
    branch: row.branch,
    worktreePath: row.worktree_path,
    prUrl: row.pr_url,
    lastCompletedStage: row.last_completed_stage,
    stage: row.stage,
    origin: row.origin,
    rationale: row.rationale,
    reviewRetries: row.review_retries,
    changesRequestedRounds: row.changes_requested_rounds,
    updatedAt: row.updated_at,
  }
}
