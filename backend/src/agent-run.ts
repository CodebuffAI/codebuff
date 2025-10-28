import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { eq } from 'drizzle-orm'

import type {
  AddAgentStepFn,
  FinishAgentRunFn,
  StartAgentRunFn,
} from '@codebuff/common/types/contracts/database'
import type { ParamsOf } from '@codebuff/common/types/function-params'

/**
 * Starts a new agent run and creates an entry in the agent_run table
 */
export async function startAgentRun(
  params: ParamsOf<StartAgentRunFn>,
): ReturnType<StartAgentRunFn> {
  const { userId, agentId, ancestorRunIds, logger } = params
  if (userId === TEST_USER_ID) {
    return 'test-run-id'
  }

  const runId = crypto.randomUUID()

  try {
    await db.insert(schema.agentRun).values({
      id: runId,
      user_id: userId,
      agent_id: agentId,
      ancestor_run_ids: ancestorRunIds.length > 0 ? ancestorRunIds : null,
      status: 'running',
      created_at: new Date(),
    })

    return runId
  } catch (error) {
    logger.error(
      { error, runId, userId, agentId, ancestorRunIds },
      'Failed to start agent run',
    )
    throw error
  }
}

/**
 * Completes an agent run by updating its status and metrics
 */
export async function finishAgentRun(
  params: ParamsOf<FinishAgentRunFn>,
): ReturnType<FinishAgentRunFn> {
  const {
    userId,
    runId,
    status,
    totalSteps,
    directCredits,
    totalCredits,
    errorMessage,
    logger,
  } = params
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

/**
 * Adds a completed step to the agent_step table
 */
export async function addAgentStep(
  params: ParamsOf<AddAgentStepFn>,
): ReturnType<AddAgentStepFn> {
  const {
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
  } = params

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
