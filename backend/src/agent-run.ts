import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { eq } from 'drizzle-orm'

import type {
  AddAgentStepFn,
  FinishAgentRunFn,
  StartAgentRunFn,
  Logger,
} from '@codebuff/agent-runtime'

/**
 * Starts a new agent run and creates an entry in the agent_run table
 */
export async function startAgentRun({
  runId,
  userId,
  agentId,
  ancestorRunIds,
  logger,
}: {
  runId?: string
  userId?: string
  agentId: string
  ancestorRunIds: string[]
  logger: Logger
}): Promise<string> {
  if (userId === TEST_USER_ID) {
    return 'test-run-id'
  }

  const id = runId ?? crypto.randomUUID()

  try {
    await db.insert(schema.agentRun).values({
      id,
      user_id: userId,
      agent_id: agentId,
      ancestor_run_ids: ancestorRunIds.length > 0 ? ancestorRunIds : null,
      status: 'running',
      created_at: new Date(),
    })

    return id
  } catch (error) {
    logger.error(
      { error, runId, userId, agentId, ancestorRunIds },
      'Failed to start agent run',
    )
    throw error
  }
}
startAgentRun satisfies StartAgentRunFn

/**
 * Completes an agent run by updating its status and metrics
 */
export async function finishAgentRun({
  userId,
  runId,
  status,
  totalSteps,
  directCredits,
  totalCredits,
  errorMessage,
  logger,
}: {
  userId: string | undefined
  runId: string
  status: 'completed' | 'failed' | 'cancelled'
  totalSteps: number
  directCredits: number
  totalCredits: number
  errorMessage?: string
  logger: Logger
}): Promise<void> {
  if (userId === TEST_USER_ID) {
    return
  }

  try {
    await db
      .update(schema.agentRun)
      .set({
        status,
        completed_at: new Date(),
        total_steps: totalSteps,
        direct_credits: directCredits.toString(),
        total_credits: totalCredits.toString(),
        error_message: errorMessage,
      })
      .where(eq(schema.agentRun.id, runId))
  } catch (error) {
    logger.error({ error, runId, status }, 'Failed to finish agent run')
    throw error
  }
}
finishAgentRun satisfies FinishAgentRunFn

/**
 * Adds a completed step to the agent_step table
 */
export async function addAgentStep({
  userId,
  agentRunId,
  stepNumber,
  credits,
  childRunIds,
  messageId,
  status = 'completed',
  errorMessage,
  startTime,
  logger,
}: {
  userId: string | undefined
  agentRunId: string
  stepNumber: number
  credits?: number
  childRunIds?: string[]
  messageId: string | null
  status?: 'running' | 'completed' | 'skipped'
  errorMessage?: string
  startTime: Date
  logger: Logger
}): Promise<string> {
  if (userId === TEST_USER_ID) {
    return 'test-step-id'
  }
  const stepId = crypto.randomUUID()

  try {
    await db.insert(schema.agentStep).values({
      id: stepId,
      agent_run_id: agentRunId,
      step_number: stepNumber,
      status,
      credits: credits?.toString(),
      child_run_ids: childRunIds,
      message_id: messageId,
      error_message: errorMessage,
      created_at: startTime,
      completed_at: new Date(),
    })

    return stepId
  } catch (error) {
    logger.error({ error, agentRunId, stepNumber }, 'Failed to add agent step')
    throw error
  }
}
addAgentStep satisfies AddAgentStepFn
