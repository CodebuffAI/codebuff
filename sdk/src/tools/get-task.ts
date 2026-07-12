import fs from 'node:fs'
import path from 'node:path'

import {
  PLAN_ARTIFACT_NAMES,
  isValidPlanSlug,
  preflightPlan,
  readPlanState,
} from '@codebuff/common/util/plan-artifacts'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'

export function getTask(params: {
  cwd: string
  session?: string
}): CodebuffToolOutput<'get_task'> {
  let session = params.session?.trim()
  if (!session) {
    const pointerPath = path.join(params.cwd, '.agents', 'ACTIVE_SESSION')
    if (fs.existsSync(pointerPath)) {
      session = fs.readFileSync(pointerPath, 'utf8').trim()
    }
  }
  if (!session) {
    return [
      {
        type: 'json',
        value: { errorMessage: 'No active plan session is configured.' },
      },
    ]
  }
  if (!isValidPlanSlug(session)) {
    return [
      {
        type: 'json',
        value: { errorMessage: `Invalid plan session slug '${session}'.` },
      },
    ]
  }
  const sessionDir = path.join('.agents', 'sessions', session)
  const absoluteSessionDir = path.join(params.cwd, sessionDir)
  if (!fs.existsSync(absoluteSessionDir)) {
    return [
      {
        type: 'json',
        value: { errorMessage: `Plan session '${session}' does not exist.` },
      },
    ]
  }
  const artifacts = PLAN_ARTIFACT_NAMES.filter((name) =>
    fs.existsSync(path.join(absoluteSessionDir, name)),
  ).map((name) => path.join(sessionDir, name))
  const planPath = path.join(absoluteSessionDir, 'PLAN.md')
  const plan = fs.existsSync(planPath) ? fs.readFileSync(planPath, 'utf8') : ''
  return [
    {
      type: 'json',
      value: {
        session,
        sessionDir,
        state: readPlanState(session, params.cwd),
        preflight: plan ? preflightPlan(plan) : null,
        artifacts,
      },
    },
  ]
}
