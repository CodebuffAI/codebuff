import {
  parsePlanTasks,
  preflightPlan,
} from '@codebuff/common/util/plan-artifacts'

import type {
  PlanSessionState,
  PlanTaskStatus,
} from '@codebuff/common/util/plan-artifacts'

type PlanTransitionUpdate = {
  taskId?: string
  task?: string
  status?: PlanTaskStatus
  completed?: boolean
}

type PlanCheckpoint = {
  taskId: string
  phase: 'validation' | 'review'
  passed: boolean
  receiptIds?: string[]
}

export type PlanTransitionValidation = {
  ok: boolean
  errors: string[]
  claimedTaskId?: string
  completedTaskIds: string[]
}

export function validatePlanTransition(params: {
  originalContent: string
  nextContent: string
  updates: PlanTransitionUpdate[]
  unmatchedTasks: string[]
  currentTask?: string | null
  existingState: PlanSessionState | null
  checkpoint?: PlanCheckpoint
}): PlanTransitionValidation {
  const errors: string[] = []
  const original = preflightPlan(params.originalContent)
  const next = preflightPlan(params.nextContent)
  if (!original.ok) {
    errors.push(...original.errors.map((error) => `PLAN preflight: ${error}`))
  }
  if (!next.ok) {
    errors.push(...next.errors.map((error) => `PLAN transition: ${error}`))
  }
  if (params.unmatchedTasks.length > 0) {
    errors.push(
      `PLAN transition is atomic; no task matched: ${params.unmatchedTasks.join(', ')}.`,
    )
  }
  const originalById = new Map(
    parsePlanTasks(params.originalContent).map((task) => [task.id, task]),
  )
  const nextTasks = parsePlanTasks(params.nextContent)
  const nextById = new Map(nextTasks.map((task) => [task.id, task]))
  const inProgress = nextTasks.filter((task) => task.status === 'in_progress')
  if (inProgress.length > 1) {
    errors.push(
      `Only one PLAN task may be in progress; found ${inProgress.map((task) => task.id).join(', ')}.`,
    )
  }
  const completedTaskIds: string[] = []
  let claimedTaskId: string | undefined
  for (const task of nextTasks) {
    const before = originalById.get(task.id)
    if (task.status === 'in_progress' && before?.status !== 'in_progress') {
      claimedTaskId = task.id
      const incompleteDependencies = task.dependencies.filter((dependency) => {
        const dependencyTask = nextById.get(dependency)
        return (
          dependencyTask?.status !== 'done' &&
          dependencyTask?.status !== 'cancelled'
        )
      })
      if (incompleteDependencies.length > 0) {
        errors.push(
          `Task ${task.id} cannot be claimed until dependencies complete: ${incompleteDependencies.join(', ')}.`,
        )
      }
    }
    if (task.status === 'done' && before?.status !== 'done') {
      completedTaskIds.push(task.id)
      const checkpoint =
        params.checkpoint?.taskId === task.id
          ? params.checkpoint
          : params.existingState?.checkpoint?.taskId === task.id
            ? params.existingState.checkpoint
            : undefined
      if (!checkpoint?.passed || checkpoint.phase !== 'validation') {
        errors.push(
          `Task ${task.id} cannot move to done without a passed validation checkpoint for that task.`,
        )
      }
      if (
        params.checkpoint?.taskId === task.id &&
        (!params.checkpoint.receiptIds ||
          params.checkpoint.receiptIds.length === 0)
      ) {
        errors.push(
          `Task ${task.id} validation checkpoint must reference at least one receipt ID.`,
        )
      }
    }
  }
  const requestedCurrentTask = params.currentTask?.trim() || null
  if (requestedCurrentTask) {
    const task = nextTasks.find(
      (candidate) =>
        requestedCurrentTask === candidate.id ||
        requestedCurrentTask.startsWith(`${candidate.id} `) ||
        requestedCurrentTask.startsWith(`${candidate.id}:`) ||
        requestedCurrentTask.startsWith(`${candidate.id} —`),
    )
    if (!task || task.status !== 'in_progress') {
      errors.push(
        `currentTask must reference the sole in-progress task; got ${requestedCurrentTask}.`,
      )
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    ...(claimedTaskId ? { claimedTaskId } : {}),
    completedTaskIds,
  }
}
