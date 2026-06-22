/**
 * The Engine — the orchestrator process's control loop (§6.2, §6.5). It owns the
 * store, worktree manager, governing docs, the §19 Orchestrator, and the pipeline
 * runner, and ties them together:
 *
 *  - handleChat()        runs the orchestrator chat agent (real deepseek-v4-flash),
 *                        whose tools mutate the task graph, then ticks.
 *  - tick()              promotes proposed→ready and admits unblocked tasks up to
 *                        the concurrency cap (§9), starting each task's pipeline.
 *  - approveAndMerge()   squash-merges a PR-ready task (§8), GCs its worktree, and
 *                        re-ticks so newly-unblocked dependents run.
 *  - requestChanges()    feeds comments back and re-runs the pipeline (§12).
 *  - abandon()           drops a task and blocks its dependents (§8).
 *
 * It emits typed events for the SSE server to relay to the UI.
 */

import { mkdirSync } from 'fs'
import { join } from 'path'

import { CodebuffClient } from '@codebuff/sdk'
import type { PrintModeEvent, RunState } from '@codebuff/sdk'

import { DocStore } from '../core/docs'
import { bunRunner, type ExecResult } from '../core/exec'
import { isMergeable, RESTACKABLE_STATUSES, TERMINAL_STATUSES, transitiveDependents } from '../core/graph'
import { Orchestrator } from '../core/orchestrator'
import { PipelineRunner, type PipelineExecutors } from '../core/pipeline'
import {
  DEFAULT_CONCURRENCY_CAP,
  isBudgetExhausted,
  recordUsage,
  selectAdmittable,
  selectPromotable,
} from '../core/scheduler'
import { Store } from '../core/store'
import { slugify, WorktreeManager } from '../core/worktree'
import { DOC_NAMES } from '../core/types'
import type { Project, Task } from '../core/types'
import {
  buildOrchestratorTools,
  orchestratorAgentDefinition,
} from './agents/orchestrator-agent'
import { buildStageExecutors } from './agents/stage-agents'

export type EngineEvent =
  | { type: 'state'; snapshot: Snapshot }
  | { type: 'chat'; event: PrintModeEvent }
  | { type: 'agent'; taskId: string; stage: string; event: PrintModeEvent }
  | { type: 'log'; message: string }

export interface Snapshot {
  project: Project
  tasks: Task[]
  docs: { name: string; present: boolean }[]
  usage: { costSpent: number; running: number; cap: number }
}

export interface EngineOptions {
  repoRoot: string
  projectId?: string
  repoUrl?: string
  client?: CodebuffClient
  defaultBranch?: string
  concurrencyCap?: number
  /**
   * Spend ceiling per rolling-24h window (§13), the hard runaway guard alongside
   * concurrency. M0 measures spend in model-cost units (USD) since that's what the
   * SDK reports per run; tokens later. Defaults to a high ceiling (effectively
   * unlimited for the free model).
   */
  dailyBudget?: number
  /** Post-task Scout that proposes follow-ups (§9). Off by default for control. */
  enableScout?: boolean
  /** Override the pipeline stage executors (tests inject stubs; prod uses SDK agents). */
  executors?: PipelineExecutors
}

export class Engine {
  readonly store: Store
  readonly worktrees: WorktreeManager
  readonly docs: DocStore
  readonly orchestrator: Orchestrator
  private readonly client: CodebuffClient
  private readonly pipeline: PipelineRunner
  private readonly projectId: string
  private readonly repoRoot: string
  private readonly orchestratorTools: ReturnType<typeof buildOrchestratorTools>
  private readonly enableScout: boolean
  /** How many follow-ups the Scout proposes per shipped task (§9). There is no
   * global backlog cap — proposals are grouped under the task that spawned them in
   * the UI, so a growing backlog stays organized rather than a flat wall. */
  private readonly scoutPerRun = 3
  /** Budget ledger key. One Freebuff account per local app in M0 (§13). */
  private readonly accountId = 'local'

  private listeners = new Set<(e: EngineEvent) => void>()
  private activePipelines = new Set<string>()
  /**
   * Deferred action for a child whose worktree is busy (it's mid-pipeline) when a
   * parent's tip moves (`restack`) or the parent is abandoned (`block`). Applied at
   * the next safe boundary — when the child's pipeline settles (§8). In-memory only:
   * on restart, `running` tasks are requeued to `ready` and the re-run path rebases
   * onto the current base anyway, so nothing is lost.
   */
  private pendingChildAction = new Map<
    string,
    { kind: 'restack' } | { kind: 'block'; reason: string }
  >()
  private guidance = new Map<string, string[]>()
  private chatRun: RunState | undefined
  /** Serializes chat turns so concurrent messages don't race on `chatRun` (§12). */
  private chatChain: Promise<void> = Promise.resolve()
  private taskSeq = 0
  private costSpent = 0
  private ticking = false

  constructor(opts: EngineOptions) {
    const fbDir = join(opts.repoRoot, '.freebuff')
    mkdirSync(fbDir, { recursive: true })

    this.projectId = opts.projectId ?? 'project'
    this.repoRoot = opts.repoRoot
    this.store = new Store(join(fbDir, 'desktop.db'))
    this.docs = new DocStore({ docsDir: join(fbDir, 'docs') })
    this.client = opts.client ?? new CodebuffClient({ apiKey: process.env.CODEBUFF_API_KEY })
    this.enableScout = opts.enableScout ?? true

    if (!this.store.getProject(this.projectId)) {
      this.store.insertProject({
        id: this.projectId,
        repoUrl: opts.repoUrl ?? opts.repoRoot,
        rootPath: opts.repoRoot,
        defaultBranch: opts.defaultBranch ?? 'main',
        dailyBudget: opts.dailyBudget ?? 1_000_000,
        concurrencyCap: opts.concurrencyCap ?? DEFAULT_CONCURRENCY_CAP,
        createdAt: this.now(),
      })
    }

    this.worktrees = new WorktreeManager({
      repoRoot: opts.repoRoot,
      defaultBranch: opts.defaultBranch ?? 'main',
    })

    this.orchestrator = new Orchestrator({
      store: this.store,
      projectId: this.projectId,
      docs: this.docs,
      idGen: () => `t${++this.taskSeq}`,
      clock: () => this.now(),
    })
    this.orchestratorTools = buildOrchestratorTools(
      this.orchestrator,
      'human',
      (taskId, message) => this.addGuidance(taskId, message),
    )

    const executors =
      opts.executors ??
      buildStageExecutors({
        client: this.client,
        worktrees: this.worktrees,
        store: this.store,
        onAgentEvent: (taskId, stage, event) => {
          if (event.type === 'finish') this.recordSpend(event.totalCost)
          this.emit({ type: 'agent', taskId, stage, event })
        },
      })
    this.pipeline = new PipelineRunner({
      store: this.store,
      executors,
      clock: () => this.now(),
      guidanceFor: (taskId) => this.guidance.get(taskId) ?? [],
      onEvent: (e) => this.emit({ type: 'log', message: `${e.type} ${'stage' in e ? e.stage : ''} ${e.taskId}` }),
    })

    // Seed the highest task id from any persisted tasks so ids stay unique, and
    // recover from a crash/restart: a task left `running` can't still be in flight
    // (activePipelines is in-memory), so requeue it to resume (§6.5).
    for (const t of this.store.listTasks(this.projectId)) {
      const n = Number(t.id.replace(/^t/, ''))
      if (Number.isFinite(n)) this.taskSeq = Math.max(this.taskSeq, n)
      if (t.status === 'running') {
        this.store.updateTask(t.id, { status: 'ready', stage: null, lastCompletedStage: null }, this.now())
      }
    }
    // Resume on startup: admit any ready/requeued tasks (nothing else kicks a tick
    // after a fresh launch). §6.5.
    void this.tick()
  }

  private now() {
    // Wall-clock: createdAt/updatedAt are persisted and sorted across process
    // restarts (FIFO scheduling, §17), so a monotonic clock would be wrong.
    return Date.now()
  }

  /** Fold spend into the rolling-24h budget ledger (§13) and the display total. */
  private recordSpend(amount: number) {
    if (!amount) return
    const ledger = recordUsage(
      this.store.getBudget(this.accountId),
      this.accountId,
      amount,
      this.now(),
    )
    this.store.upsertBudget(ledger)
    this.costSpent += amount
  }

  /** Queue a steer for a task's next pipeline stage (§19 send_guidance, §12). */
  private addGuidance(taskId: string, message: string) {
    const list = this.guidance.get(taskId) ?? []
    list.push(message)
    this.guidance.set(taskId, list)
  }

  // — Event bus —

  on(listener: (e: EngineEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: EngineEvent) {
    for (const l of this.listeners) l(event)
  }

  snapshot(): Snapshot {
    const project = this.store.getProject(this.projectId)!
    const tasks = this.store.listTasks(this.projectId)
    return {
      project,
      tasks,
      docs: DOC_NAMES.map((name) => ({ name, present: this.docs.exists(name) })),
      usage: {
        costSpent: this.costSpent,
        running: tasks.filter((t) => t.status === 'running').length,
        cap: project.concurrencyCap,
      },
    }
  }

  emitState() {
    this.emit({ type: 'state', snapshot: this.snapshot() })
  }

  /**
   * Release process-level resources (the SQLite handle, listeners) so the engine
   * can be discarded when the user opens a different project directory (§6.2). The
   * in-memory pipeline state is dropped with the instance.
   */
  close() {
    this.listeners.clear()
    this.store.close()
  }

  artifacts(taskId: string) {
    return this.store.getArtifacts(taskId)
  }

  /**
   * Save a human edit to a governing doc (§10.1 — human edits save directly).
   * Enforces the length cap (§10.2); throws DocCapError if over.
   */
  saveDoc(name: string, content: string): void {
    if (!DocStore.isDocName(name)) throw new Error(`Unknown doc "${name}"`)
    this.docs.write(name, content)
    this.emitState()
  }

  /**
   * Run a shell command in the project root and capture its output — the "see it
   * work" loop the UI's Run panel uses (run a CLI, a test, a build, or a static
   * server). Run-and-capture with a timeout; suited to short verification
   * commands, not long-lived servers.
   */
  async runShell(command: string, timeoutMs = 15_000): Promise<ExecResult> {
    return bunRunner.run('bash', ['-lc', command], {
      cwd: this.repoRoot,
      timeoutMs,
      outputCapBytes: 20_000,
    })
  }

  // — Chat —

  /**
   * Run a chat turn. Turns are serialized on `chatChain` so two quickly-sent
   * messages don't race on `chatRun` and corrupt conversation history (§12).
   */
  handleChat(message: string): Promise<void> {
    this.chatChain = this.chatChain
      .catch(() => {}) // a failed prior turn must not stall the queue
      .then(() => this.runChatTurn(message))
    return this.chatChain
  }

  private async runChatTurn(message: string): Promise<void> {
    const toolNames = this.orchestratorTools.map((t) => t.toolName)
    this.store.appendChatMessage(this.projectId, { role: 'user', text: message }, this.now())
    let assistantText = ''
    const acts: { toolName: string; input: unknown }[] = []
    this.chatRun = await this.client.run({
      agent: orchestratorAgentDefinition(toolNames),
      prompt: message,
      previousRun: this.chatRun,
      customToolDefinitions: this.orchestratorTools,
      handleEvent: (event) => {
        this.emit({ type: 'chat', event })
        if (event.type === 'text') assistantText += event.text
        if (event.type === 'tool_call') acts.push({ toolName: event.toolName, input: event.input })
        if (event.type === 'tool_result') this.emitState()
        if (event.type === 'finish') this.recordSpend(event.totalCost)
      },
    })
    this.store.appendChatMessage(
      this.projectId,
      { role: 'assistant', text: assistantText, acts },
      this.now(),
    )
    this.emitState()
    void this.tick()
  }

  /** Persisted chat transcript for this project (§12) — loaded by the UI on open. */
  chatHistory() {
    return this.store.getChatMessages(this.projectId)
  }

  // — Scheduler tick —

  async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      for (const id of selectPromotable(this.store.listTasks(this.projectId))) {
        this.store.updateTask(id, { status: 'ready' }, this.now())
      }
      const project = this.store.getProject(this.projectId)!
      // Daily budget is a hard ceiling alongside concurrency (§13): once spent,
      // no NEW work is admitted; in-flight tasks finish their current stage.
      const budgetExhausted = isBudgetExhausted(
        this.store.getBudget(this.accountId),
        project.dailyBudget,
        this.now(),
      )
      const admit = selectAdmittable({
        tasks: this.store.listTasks(this.projectId),
        concurrencyCap: project.concurrencyCap,
        budgetExhausted,
      }).filter((id) => !this.activePipelines.has(id))

      this.emitState()
      for (const id of admit) void this.startTask(id)
    } finally {
      this.ticking = false
    }
  }

  private async startTask(taskId: string): Promise<void> {
    if (this.activePipelines.has(taskId)) return
    this.activePipelines.add(taskId)
    try {
      let task = this.store.getTask(taskId)!
      if (!task.branch) {
        const slug = `${slugify(task.title)}-${taskId}`
        const { branch, worktreePath, baseSha } = await this.worktrees.create(taskId, slug)
        // Dependent (§8): branch off `main`, then merge in any parent whose work
        // hasn't landed yet so the child builds on it before the human merges. A
        // conflict among the parents has no auto-resolver — block for a human.
        let baseRef = baseSha
        const parentBranches = this.unmergedParentBranches(task)
        if (parentBranches.length > 0) {
          const merged = await this.worktrees.mergeParentBranches(taskId, parentBranches)
          if (!merged.clean) {
            this.store.updateTask(taskId, { branch, worktreePath, baseRef }, this.now())
            this.blockChild(
              taskId,
              `Couldn't build on unmerged parent branch(es) ${parentBranches.join(', ')} — ` +
                `they conflict.\nResolve by merging a parent first, or abandon.` +
                (merged.detail ? `\n\n${merged.detail}` : ''),
            )
            return
          }
          baseRef = merged.baseSha!
        }
        this.store.updateTask(taskId, { branch, worktreePath, baseRef }, this.now())
        task = this.store.getTask(taskId)!
      } else if (task.lastCompletedStage === null) {
        // Re-run (request-changes / blocked-retry): rebase onto the current base to
        // KEEP the existing implementation + fix attempts (so a review-blocked retry
        // refines the work instead of restarting and thrashing on the same issue).
        // The base is latest main for an independent task, or a fresh integration of
        // main + unmerged parents for a dependent (§8). Only reset from scratch if the
        // branch genuinely no longer applies.
        if (task.parents.length > 0) {
          // null → parents conflict and the task is now blocked; don't run the pipeline.
          if ((await this.rebaseOntoFreshBase(task, 'reset')) === null) return
        } else {
          const rebase = await this.worktrees.rebaseOntoDefault(taskId, { fetch: false })
          if (!rebase.clean) await this.worktrees.resetToDefault(taskId)
        }
      }
      this.emit({ type: 'log', message: `Starting pipeline for ${taskId} (${task.title})` })
      const result = await this.pipeline.run(taskId)
      this.emit({ type: 'log', message: `Task ${taskId} → ${result.status}` })
      // Surface the latest state of a halted task (incl. uncommitted fixes) so the
      // human reviews on the current diff, not a stale one (§13).
      if (result.status === 'blocked' || result.status === 'failed') {
        this.store.setArtifact(taskId, 'diff', await this.worktrees.workingDiff(taskId).catch(() => ''))
        this.store.setArtifact(taskId, 'blockReason', result.reason)
      }
      this.guidance.delete(taskId)
      if (result.status === 'awaiting-approval') {
        // This task's branch tip is now stable. If it has dependents that already
        // started on an older tip (it was re-run after request-changes), restack them
        // onto the new tip; on first completion there are none, so this is a no-op (§8).
        await this.restackChildrenOf(taskId)
        if (this.enableScout) {
          void this.runScout(taskId) // fire-and-forget: don't block the task settling
        }
      }
    } catch (err) {
      // Capture the error as the blockReason so the UI's "Retry with guidance"
      // path shows *why* it failed (a thrown pipeline error — infra blip, SDK
      // error — otherwise leaves a red `failed` task with no explanation).
      this.store.setArtifact(taskId, 'blockReason', `Pipeline error: ${(err as Error).message}`)
      this.store.updateTask(taskId, { status: 'failed', stage: null }, this.now())
      this.emit({ type: 'log', message: `Task ${taskId} errored: ${(err as Error).message}` })
    } finally {
      this.activePipelines.delete(taskId)
      // Now that the worktree is idle, apply any action deferred while it was busy
      // (a parent moved → restack, or a parent was abandoned → block) (§8).
      await this.applyPendingChildAction(taskId)
      this.emitState()
      void this.tick()
    }
  }

  // — Dependency restacking (§8) —

  /** Branches of a task's parents whose work hasn't merged yet (merged parents are
   * already on `main`, so they're excluded). These get merged into / restacked under
   * a dependent so it builds on their not-yet-landed code. */
  private unmergedParentBranches(task: Task): string[] {
    return task.parents
      .map((id) => this.store.getTask(id))
      .filter((p): p is Task => !!p && p.status === 'awaiting-approval' && !!p.branch)
      .map((p) => p.branch!)
  }

  /** Restack every live dependent of `parentId` whose tip just changed (parent
   * re-ran or merged). A dependent that hasn't started yet has no branch and simply
   * gets a fresh base when the scheduler admits it, so it's skipped here. */
  private async restackChildrenOf(parentId: string): Promise<void> {
    for (const childId of this.store.childrenOf(parentId)) {
      const child = this.store.getTask(childId)
      if (!child || !child.branch) continue
      // Only restack actively-progressing dependents. A `blocked`/`failed` child is
      // awaiting human action and is reviewed on a stable diff (§13) — don't rebase it
      // underneath the human; its re-run recomputes the base anyway (§8, §12).
      if (!RESTACKABLE_STATUSES.has(child.status)) continue
      if (this.activePipelines.has(childId)) {
        // Worktree busy — defer the restack until the pipeline settles.
        this.pendingChildAction.set(childId, { kind: 'restack' })
        continue
      }
      await this.restackChild(child)
    }
  }

  /**
   * Rebase a dependent's branch onto a freshly-recomputed integration base (main +
   * its still-unmerged parents), replaying only the child's own commits. Returns the
   * new base SHA, or null if the parents themselves conflict (the task is blocked).
   * `onSelfConflict` decides what to do if the child's commits don't replay: `block`
   * it for a human (the restack-cascade path), or `reset` to the base so the pipeline
   * re-implements from there (the re-run path) (§8, §12).
   */
  private async rebaseOntoFreshBase(
    task: Task,
    onSelfConflict: 'block' | 'reset',
  ): Promise<string | null> {
    const base = await this.worktrees.integrationBaseSha(task.id, this.unmergedParentBranches(task))
    if (!base.clean) {
      this.blockChild(task.id, `Parent branches conflict — can't rebuild this task's base.${base.detail ? `\n\n${base.detail}` : ''}`)
      return null
    }
    // `--onto newBase <oldBase>` needs the real old base to replay only the task's own
    // commits. Without a recorded baseRef (e.g. a pre-v3 row) we can't pick a safe
    // upstream, so treat it as a non-clean replay rather than guessing.
    const res = task.baseRef
      ? await this.worktrees.restack(task.id, base.baseSha, task.baseRef)
      : { clean: false, detail: 'no recorded base to restack from' }
    if (!res.clean) {
      if (onSelfConflict === 'block') {
        this.blockChild(task.id, `Couldn't restack onto the updated parent work — it conflicts.\nRequest changes to re-run from the new base, or abandon.${res.detail ? `\n\n${res.detail}` : ''}`)
        return null
      }
      await this.worktrees.resetTo(task.id, base.baseSha)
    }
    this.store.updateTask(task.id, { baseRef: base.baseSha }, this.now())
    return base.baseSha
  }

  /** Restack one dependent whose parent's tip moved (re-ran or merged). After a
   * successful restack the child's tip moved too, so cascade to its dependents (§8). */
  private async restackChild(child: Task): Promise<void> {
    if ((await this.rebaseOntoFreshBase(child, 'block')) === null) return
    this.emit({ type: 'log', message: `Restacked ${child.id} onto updated base` })
    await this.restackChildrenOf(child.id)
  }

  private blockChild(taskId: string, reason: string): void {
    this.store.updateTask(taskId, { status: 'blocked', stage: null }, this.now())
    this.store.setArtifact(taskId, 'blockReason', reason)
    this.emit({ type: 'log', message: `Task ${taskId} blocked: ${reason.split('\n')[0]}` })
  }

  /** Apply a restack/block deferred while a child's worktree was busy (§8). */
  private async applyPendingChildAction(taskId: string): Promise<void> {
    const action = this.pendingChildAction.get(taskId)
    if (!action) return
    this.pendingChildAction.delete(taskId)
    const task = this.store.getTask(taskId)
    if (!task || TERMINAL_STATUSES.has(task.status)) return
    if (action.kind === 'block') {
      this.blockChild(taskId, action.reason)
      // The child was built on an abandoned parent; drop its worktree and branch so a
      // later re-run starts fresh from main (§8).
      await this.worktrees.remove(taskId).catch(() => {})
      this.store.updateTask(taskId, { branch: null, worktreePath: null, baseRef: null }, this.now())
    } else if (task.branch) {
      await this.restackChild(task)
    }
  }

  // — Human actions —

  async approveAndMerge(taskId: string): Promise<void> {
    const task = this.store.getTask(taskId)
    if (!task || task.status !== 'awaiting-approval' || !task.branch) return
    // Merge gate (§8): a dependent's branch is stacked on its parents' commits, so it
    // can't land ahead of them. Block merging until every parent is merged; once a
    // parent merges we restack this child onto `main` (below), making it mergeable.
    const statusOf = (id: string) => this.store.getTask(id)?.status
    if (!isMergeable(task, statusOf)) {
      const pending = task.parents.filter((p) => this.store.getTask(p)?.status !== 'merged')
      this.emit({
        type: 'log',
        message: `Can't merge ${taskId} yet — waiting on parent merge: ${pending.join(', ')}`,
      })
      return
    }
    const message = `${task.title} (#${taskId})`

    if (await this.worktrees.hasRemote()) {
      await this.worktrees.squashMerge(taskId, task.branch)
      // `gh pr merge` lands the squash on the remote only; pull it into the local
      // default branch so the restack below (and future dependents) build on the
      // just-merged parent rather than a stale `main` (§8).
      await this.worktrees.syncDefaultFromRemote().catch(() => {})
    } else {
      // Rebase onto latest main before merging (§8): a sibling task may have
      // merged first and touched the same lines. If the rebase doesn't apply
      // cleanly, surface it to the human as `blocked` — never auto-resolve, never
      // leave the working tree conflicted.
      const rebase = await this.worktrees.rebaseOntoDefault(taskId, { fetch: false })
      if (!rebase.clean) {
        this.store.setArtifact(taskId, 'diff', await this.worktrees.workingDiff(taskId).catch(() => ''))
        this.store.setArtifact(
          taskId,
          'blockReason',
          `Sibling-merge conflict: this branch no longer applies cleanly onto ` +
            `${this.store.getProject(this.projectId)!.defaultBranch} (another task changed the ` +
            `same lines). Resolve by requesting changes (re-runs from latest main) or abandoning.` +
            (rebase.detail ? `\n\n${rebase.detail}` : ''),
        )
        this.store.updateTask(taskId, { status: 'blocked', stage: null }, this.now())
        this.emit({ type: 'log', message: `Merge of ${taskId} blocked: sibling conflict` })
        this.emitState()
        return
      }
      await this.worktrees.localSquashMerge(task.branch, message)
    }

    this.store.updateTask(taskId, { status: 'merged', stage: null }, this.now())
    await this.worktrees.remove(taskId).catch(() => {})
    this.emit({ type: 'log', message: `Merged ${taskId}` })
    // This task's content is now squashed onto `main`. Restack its live dependents
    // off `main` (dropping this parent's now-landed commits) so they keep building
    // and become mergeable in turn (§8).
    await this.restackChildrenOf(taskId)
    this.emitState()
    void this.tick()
  }

  requestChanges(taskId: string, comments: string): void {
    const task = this.store.getTask(taskId)
    if (!task) return
    // Feed the gate's own findings back so the re-run addresses them instead of
    // rediscovering the same issue (avoids review→block→retry thrash).
    const blockReason = this.store.getArtifacts(taskId).blockReason
    if (blockReason) this.addGuidance(taskId, `Address these findings from the last attempt:\n${blockReason}`)
    if (comments.trim()) this.addGuidance(taskId, comments)
    // Re-run the pipeline from implement on the same task (§12).
    this.store.updateTask(
      taskId,
      {
        status: 'ready',
        lastCompletedStage: null,
        stage: null,
        changesRequestedRounds: task.changesRequestedRounds + 1,
      },
      this.now(),
    )
    this.emitState()
    void this.tick()
  }

  async abandon(taskId: string): Promise<void> {
    // orchestrator.abandonTask marks the task abandoned and cascades `blocked` to all
    // (transitive) dependents — their work was built on this one (§8). Capture the same
    // set first so we can clean up the worktrees of any that already started.
    const isTerminal = (id: string) => {
      const t = this.store.getTask(id)
      return !t || TERMINAL_STATUSES.has(t.status)
    }
    const descendants = transitiveDependents(taskId, (id) => this.store.childrenOf(id), isTerminal)
    this.orchestrator.abandonTask({ taskId })
    this.guidance.delete(taskId)
    await this.worktrees.remove(taskId).catch(() => {})
    const reason =
      `A task this depended on was abandoned — its work was built on it. ` +
      `Request changes to re-run from main, or abandon.`
    for (const id of descendants) {
      this.guidance.delete(id)
      if (this.activePipelines.has(id)) {
        // Running — block + GC when its pipeline settles (don't touch a busy worktree).
        this.pendingChildAction.set(id, { kind: 'block', reason })
        continue
      }
      this.store.setArtifact(id, 'blockReason', reason)
      if (this.store.getTask(id)?.branch) {
        await this.worktrees.remove(id).catch(() => {})
        // Clear branch/base so a later re-run starts fresh from main (§8).
        this.store.updateTask(id, { branch: null, worktreePath: null, baseRef: null }, this.now())
      }
    }
    this.emitState()
    void this.tick()
  }

  /** Accept a Scout proposal (§9): promote it to `ready` so the scheduler runs it. */
  acceptTask(taskId: string): void {
    const task = this.store.getTask(taskId)
    if (!task || task.status !== 'proposed') return
    this.store.updateTask(taskId, { status: 'ready' }, this.now())
    this.emit({ type: 'log', message: `Accepted scout proposal ${taskId}` })
    this.emitState()
    void this.tick()
  }

  /** Dismiss a Scout proposal without running it. */
  dismissTask(taskId: string): void {
    const task = this.store.getTask(taskId)
    if (!task || task.status !== 'proposed') return
    this.store.updateTask(taskId, { status: 'abandoned', stage: null }, this.now())
    this.emit({ type: 'log', message: `Dismissed scout proposal ${taskId}` })
    this.emitState()
    void this.tick()
  }

  // — Scout (§9) —

  private async runScout(parentTaskId: string): Promise<void> {
    const parent = this.store.getTask(parentTaskId)
    if (!parent) return
    // No backlog cap: the Scout proposes a few follow-ups for every shipped task,
    // and the UI groups them under the task that spawned them (§9), so the backlog
    // stays organized instead of a flat wall. Each proposal is stamped with
    // `spawnedFrom: parentTaskId` for that grouping.
    //
    // Only create_task: a small model given read/inspect tools burns its turn
    // researching and never proposes. We inline the context it needs below.
    const scoutTools = buildOrchestratorTools(
      this.orchestrator,
      'scout',
      undefined,
      parentTaskId,
    ).filter((t) => t.toolName === 'create_task')
    const priorities = this.docs.read('priorities').trim()
    const existing = this.store
      .listTasks(this.projectId)
      .map((t) => `- ${t.title} [${t.status}]`)
      .join('\n')
    try {
      await this.client.run({
        agent: {
          id: 'freebuff-desktop-scout',
          displayName: 'Scout',
          model: orchestratorAgentDefinition([]).model,
          toolNames: scoutTools.map((t) => t.toolName),
          systemPrompt:
            `You are the Scout (§9). A task just shipped. Your job is to keep the ` +
            `project moving by proposing the next 1–${this.scoutPerRun} concrete, worthwhile tasks ` +
            "that advance the project's priorities — natural next features, polish, " +
            'or debt the just-finished work created. Lean toward proposing useful ' +
            'next steps. Each create_task needs a short imperative title, a concrete ' +
            'description, and a one-line rationale. Prefer independent tasks when work ' +
            "is genuinely separate, but don't avoid dependencies: a dependent task now " +
            'starts as soon as its parent passes review and testing (it no longer waits ' +
            'for the human to merge), so wire a dependency whenever work builds on ' +
            'another task. Do NOT duplicate an existing task. Only propose nothing if ' +
            'the project is genuinely complete given the priorities.',
          instructionsPrompt: 'Create your proposed follow-up tasks now using create_task.',
        },
        prompt:
          `Just shipped: "${parent.title}"\n${parent.description}\n\n` +
          (priorities ? `Project priorities:\n${priorities}\n\n` : 'Project priorities: (none set yet)\n\n') +
          `Existing tasks (do not duplicate):\n${existing}\n\n` +
          `Propose up to ${this.scoutPerRun} worthwhile follow-up tasks via create_task.`,
        customToolDefinitions: scoutTools,
        handleEvent: (event) => {
          if (event.type === 'finish') this.recordSpend(event.totalCost)
          this.emit({ type: 'agent', taskId: parentTaskId, stage: 'scout', event })
        },
      })
      this.emit({ type: 'log', message: `Scout ran off ${parentTaskId}` })
    } catch (err) {
      this.emit({ type: 'log', message: `Scout error: ${(err as Error).message}` })
    }
    this.emitState()
  }
}
