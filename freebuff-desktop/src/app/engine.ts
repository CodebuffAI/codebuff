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
  /** Cap on outstanding Scout proposals so the backlog can't grow unbounded — the
   * Scout fires off every shipped task, so without this a 3-task project piles up
   * 8+ proposals (§9). When the backlog is full the Scout skips until the human
   * accepts/dismisses some. */
  private readonly scoutBacklogCap = 4
  /** Budget ledger key. One Freebuff account per local app in M0 (§13). */
  private readonly accountId = 'local'

  private listeners = new Set<(e: EngineEvent) => void>()
  private activePipelines = new Set<string>()
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
        const { branch, worktreePath } = await this.worktrees.create(taskId, slug)
        this.store.updateTask(taskId, { branch, worktreePath }, this.now())
        task = this.store.getTask(taskId)!
      } else if (task.lastCompletedStage === null) {
        // Re-run (request-changes / blocked-retry): rebase onto latest main to KEEP
        // the existing implementation + fix attempts (so a review-blocked retry
        // refines the work instead of restarting and thrashing on the same issue).
        // Only reset to main from scratch if the branch genuinely no longer applies
        // (a sibling-merge conflict, §8).
        const rebase = await this.worktrees.rebaseOntoDefault(taskId, { fetch: false })
        if (!rebase.clean) await this.worktrees.resetToDefault(taskId)
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
      if (result.status === 'awaiting-approval' && this.enableScout) {
        void this.runScout(taskId) // fire-and-forget: don't block the task settling
      }
    } catch (err) {
      this.store.updateTask(taskId, { status: 'failed', stage: null }, this.now())
      this.emit({ type: 'log', message: `Task ${taskId} errored: ${(err as Error).message}` })
    } finally {
      this.activePipelines.delete(taskId)
      this.emitState()
      void this.tick()
    }
  }

  // — Human actions —

  async approveAndMerge(taskId: string): Promise<void> {
    const task = this.store.getTask(taskId)
    if (!task || task.status !== 'awaiting-approval' || !task.branch) return
    const message = `${task.title} (#${taskId})`

    if (await this.worktrees.hasRemote()) {
      await this.worktrees.squashMerge(taskId, task.branch)
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
    this.orchestrator.abandonTask({ taskId })
    this.guidance.delete(taskId)
    await this.worktrees.remove(taskId).catch(() => {})
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
    // Backlog cap: the Scout fires off every shipped task, so without a ceiling a
    // small project accumulates a wall of proposals. Skip while the proposed
    // backlog is full — it resumes once the human accepts/dismisses some (§9).
    const proposedCount = this.store
      .listTasks(this.projectId)
      .filter((t) => t.status === 'proposed').length
    if (proposedCount >= this.scoutBacklogCap) {
      this.emit({
        type: 'log',
        message: `Scout skipped: ${proposedCount} proposals already pending (cap ${this.scoutBacklogCap})`,
      })
      return
    }
    // Only create_task: a small model given read/inspect tools burns its turn
    // researching and never proposes. We inline the context it needs below.
    const scoutTools = buildOrchestratorTools(this.orchestrator, 'scout').filter(
      (t) => t.toolName === 'create_task',
    )
    const slots = this.scoutBacklogCap - proposedCount
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
            `project moving by proposing the next ${slots === 1 ? '1' : `1–${slots}`} concrete, worthwhile task${slots === 1 ? '' : 's'} ` +
            "that advance the project's priorities — natural next features, polish, " +
            'or debt the just-finished work created. Lean toward proposing useful ' +
            'next steps. Each create_task needs a short imperative title, a concrete ' +
            'description, and a one-line rationale. Prefer INDEPENDENT tasks. Do NOT ' +
            'duplicate an existing task. Only propose nothing if the project is ' +
            'genuinely complete given the priorities.',
          instructionsPrompt: 'Create your proposed follow-up tasks now using create_task.',
        },
        prompt:
          `Just shipped: "${parent.title}"\n${parent.description}\n\n` +
          (priorities ? `Project priorities:\n${priorities}\n\n` : 'Project priorities: (none set yet)\n\n') +
          `Existing tasks (do not duplicate):\n${existing}\n\n` +
          `Propose up to ${slots} worthwhile follow-up task${slots === 1 ? '' : 's'} via create_task.`,
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
