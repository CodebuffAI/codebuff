import { GrantTypeValues } from '@codebuff/common/types/grant'
import { pgEnum } from 'drizzle-orm/pg-core'

import { ReferralStatusValues } from '../../types/referral'

export const ReferralStatus = pgEnum('referral_status', [
  ReferralStatusValues[0],
  ...ReferralStatusValues.slice(1),
])

export const apiKeyTypeEnum = pgEnum('api_key_type', [
  'anthropic',
  'gemini',
  'openai',
])

export const grantTypeEnum = pgEnum('grant_type', [
  GrantTypeValues[0],
  ...GrantTypeValues.slice(1),
])
export type GrantType = (typeof grantTypeEnum.enumValues)[number]

export const sessionTypeEnum = pgEnum('session_type', ['web', 'pat', 'cli'])

export const agentRunStatus = pgEnum('agent_run_status', [
  'running',
  'completed',
  'failed',
  'cancelled',
])

export const agentStepStatus = pgEnum('agent_step_status', [
  'running',
  'completed',
  'skipped',
])

export const orgRoleEnum = pgEnum('org_role', ['owner', 'admin', 'member'])
