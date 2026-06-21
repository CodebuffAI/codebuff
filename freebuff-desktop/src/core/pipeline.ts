/**
 * Per-task pipeline runner (§7) — the fixed, code-backed stage sequence every
 * task runs: implement → simplify → review → test → pr.
 *
 * This is the *runner*: it drives the stages, owns the bounded review→fix→re-review
 * loop (§7, default 2 retries), persists `lastCompletedStage` for pause/resume
 * (§6.5), and routes outcomes to task status. The actual agent work lives behind the
 * pluggable `StageExecutor` interface — M0 wires SDK-backed executors here; tests
 * wire stubs. Agents *adapt* the pipeline by returning `skipped` for stages that
 * don't apply (§7).
 */

import { PIPELINE_STAGES, type PipelineStage, type Project, type Task } from './types'
import type { Store } from './store'

export interface StageContext {
  task: Task
  project: Project
  /** Queued human/orchestrator guidance to fold in this stage (§12, §19). */
  guidance: string[]
}

/** Outcome of a non-review stage. `ok`/`skipped` advance; the rest halt the task. */
export type StageOutcome =
  | { kind: 'ok'; prUrl?: string }
  | { kind: 'skipped' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'failed'; reason: string }

export interface StageExecutor {
  run(ctx: StageContext): Promise<StageOutcome>
}

/** Review returns either a pass, fixable findings, or an escalation (§7). */
export type ReviewOutcome =
  | { kind: 'ok' }
  | { kind: 'needs-fixes'; findings: string }
  | { kind: 'blocked'; reason: string }
  | { kind: 'failed'; reason: string }

export interface ReviewExecutor {
  run(ctx: StageContext): Promise<ReviewOutcome>
  /** Apply the reviewer's findings in the worktree, then the runner re-reviews. */
  fix(ctx: StageContext, findings: string): Promise<void>
}

export interface PipelineExecutors {
  implement: StageExecutor
  simplify: StageExecutor
  review: ReviewExecutor
  test: StageExecutor
  pr: StageExecutor
}

export type PipelineEvent =
  | { type: 'stage_started'; taskId: string; stage: PipelineStage }
  | { type: 'stage_completed'; taskId: string; stage: PipelineStage; skipped: boolean }
  | { type: 'review_retry'; taskId: string; round: number }
  | { type: 'task_surfaced'; taskId: string }
  | { type: 'task_blocked'; taskId: string; reason: string }
  | { type: 'task_failed'; taskId: string; reason: string }

export interface PipelineRunnerOptions {
  store: Store
  executors: PipelineExecutors
  clock: () => number
  /** Bounded review retries before escalating to the human (§7, default 2). */
  maxReviewRetries?: number
  /** Optional guidance source drained per task (§19 send_guidance). */
  guidanceFor?: (taskId: string) => string[]
  onEvent?: (event: PipelineEvent) => void
}

export type PipelineResult =
  | { status: 'awaiting-approval' }
  | { status: 'blocked'; reason: string }
  | { status: 'failed'; reason: string }

export class PipelineRunner {
  private readonly opts: Required<
    Pick<PipelineRunnerOptions, 'store' | 'executors' | 'clock'>
  > &
    PipelineRunnerOptions
  private readonly maxReviewRetries: number

  constructor(opts: PipelineRunnerOptions) {
    this.opts = opts
    this.maxReviewRetries = opts.maxReviewRetries ?? 2
  }

  private emit(event: PipelineEvent) {
    this.opts.onEvent?.(event)
  }

  /**
   * Run (or resume) a task's pipeline. Resumes at the stage *after*
   * `lastCompletedStage` (§6.5): a completed stage isn't redone; the interrupted
   * stage re-runs from its start. Returns the terminal-ish status the task lands in.
   */
  async run(taskId: string): Promise<PipelineResult> {
    const { store, clock } = this.opts
    const task = store.getTask(taskId)
    if (!task) throw new Error(`Task ${taskId} not found`)
    const project = store.getProject(task.projectId)
    if (!project) throw new Error(`Project ${task.projectId} not found`)

    const startIndex = task.lastCompletedStage
      ? PIPELINE_STAGES.indexOf(task.lastCompletedStage) + 1
      : 0

    for (let i = startIndex; i < PIPELINE_STAGES.length; i++) {
      const stage = PIPELINE_STAGES[i]
      const ctx: StageContext = {
        task: store.getTask(taskId)!,
        project,
        guidance: this.opts.guidanceFor?.(taskId) ?? [],
      }

      store.updateTask(taskId, { status: 'running', stage }, clock())
      this.emit({ type: 'stage_started', taskId, stage })

      const outcome =
        stage === 'review'
          ? await this.runReview(ctx)
          : await this.opts.executors[stage].run(ctx)

      if (outcome.kind === 'blocked') {
        store.updateTask(taskId, { status: 'blocked', stage: null }, clock())
        this.emit({ type: 'task_blocked', taskId, reason: outcome.reason })
        return { status: 'blocked', reason: outcome.reason }
      }
      if (outcome.kind === 'failed') {
        store.updateTask(taskId, { status: 'failed', stage: null }, clock())
        this.emit({ type: 'task_failed', taskId, reason: outcome.reason })
        return { status: 'failed', reason: outcome.reason }
      }

      if (stage === 'pr' && outcome.kind === 'ok' && outcome.prUrl) {
        store.updateTask(taskId, { prUrl: outcome.prUrl }, clock())
      }

      store.updateTask(taskId, { lastCompletedStage: stage }, clock())
      this.emit({
        type: 'stage_completed',
        taskId,
        stage,
        skipped: outcome.kind === 'skipped',
      })
    }

    store.updateTask(taskId, { status: 'awaiting-approval', stage: null }, clock())
    this.emit({ type: 'task_surfaced', taskId })
    return { status: 'awaiting-approval' }
  }

  /**
   * Review with a bounded fix loop (§7): review → (findings → fix → re-review)
   * up to `maxReviewRetries`; if it still doesn't pass, escalate the task to the
   * human with the findings rather than looping forever.
   */
  private async runReview(ctx: StageContext): Promise<StageOutcome> {
    const review = this.opts.executors.review
    const { store, clock } = this.opts
    let round = 0

    while (true) {
      const result = await review.run(ctx)
      if (result.kind === 'ok') return { kind: 'ok' }
      if (result.kind === 'blocked') return { kind: 'blocked', reason: result.reason }
      if (result.kind === 'failed') return { kind: 'failed', reason: result.reason }

      // needs-fixes
      if (round >= this.maxReviewRetries) {
        return {
          kind: 'blocked',
          reason: `Review did not pass after ${this.maxReviewRetries} fix round(s). Latest findings:\n${result.findings}`,
        }
      }
      round++
      store.updateTask(ctx.task.id, { reviewRetries: round }, clock())
      this.emit({ type: 'review_retry', taskId: ctx.task.id, round })
      await review.fix(ctx, result.findings)
    }
  }
}
