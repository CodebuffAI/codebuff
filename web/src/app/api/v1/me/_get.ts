import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { getReferralLink } from '@codebuff/common/util/referral'
import { NextResponse } from 'next/server'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

import { VALID_USER_INFO_FIELDS } from '@/db/user'
import { extractApiKeyFromHeader } from '@/util/auth'

const DERIVED_USER_INFO_FIELDS = ['referral_link'] as const

type DerivedField = (typeof DERIVED_USER_INFO_FIELDS)[number]
type ValidDbField = (typeof VALID_USER_INFO_FIELDS)[number]
type ValidField = ValidDbField | DerivedField

const ALL_USER_INFO_FIELDS = [
  ...VALID_USER_INFO_FIELDS,
  ...DERIVED_USER_INFO_FIELDS,
] as const

export async function getMe(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  trackEvent: TrackEventFn
}) {
  const { req, getUserInfoFromApiKey, logger, trackEvent } = params

  const apiKey = extractApiKeyFromHeader(req)

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing or invalid Authorization header' },
      { status: 401 },
    )
  }

  // Parse fields from query parameter
  const fieldsParam = req.nextUrl.searchParams.get('fields')
  let fields: ValidField[]
  if (fieldsParam !== null) {
    const requestedFields = fieldsParam
      .split(',')
      .map((f) => f.trim())
      .filter((f) => f.length > 0)

    // Check if we have any fields after filtering
    if (requestedFields.length === 0) {
      return NextResponse.json(
        {
          error: `Invalid fields: empty. Valid fields are: ${ALL_USER_INFO_FIELDS.join(', ')}`,
        },
        { status: 400 },
      )
    }

    // Validate that all requested fields are valid
    const invalidFields = requestedFields.filter(
      (f) => !ALL_USER_INFO_FIELDS.includes(f as ValidField),
    )
    if (invalidFields.length > 0) {
      trackEvent({
        event: AnalyticsEvent.ME_VALIDATION_ERROR,
        userId: 'unknown',
        properties: {
          invalidFields,
          requestedFields,
        },
        logger,
      })
      return NextResponse.json(
        {
          error: `Invalid fields: ${invalidFields.join(', ')}. Valid fields are: ${ALL_USER_INFO_FIELDS.join(', ')}`,
        },
        { status: 400 },
      )
    }
    fields = requestedFields as ValidField[]
  } else {
    // Default to just 'id'
    fields = ['id']
  }

  // Build database field selection (exclude derived fields, always include id)
  const dbFieldsSet = new Set<ValidDbField>()

  for (const field of fields) {
    if (VALID_USER_INFO_FIELDS.includes(field as ValidDbField)) {
      dbFieldsSet.add(field as ValidDbField)
    }
  }

  // Always include id for tracking
  dbFieldsSet.add('id')

  // If referral_link is requested, ensure we also fetch referral_code
  if (fields.includes('referral_link') && !dbFieldsSet.has('referral_code')) {
    dbFieldsSet.add('referral_code')
  }

  const dbFields = Array.from(dbFieldsSet)

  // Get user info
  const userInfo = await getUserInfoFromApiKey({
    apiKey,
    fields: dbFields,
    logger,
  })

  if (!userInfo) {
    return NextResponse.json(
      { error: 'Invalid API key or user not found' },
      { status: 401 },
    )
  }

  // Track successful API request
  trackEvent({
    event: AnalyticsEvent.ME_API_REQUEST,
    userId: userInfo.id,
    properties: {
      requestedFields: fields,
    },
    logger,
  })

  // Build response including derived fields
  const userInfoRecord = userInfo as Partial<Record<ValidDbField, string | null>>

  const responseBody: Record<string, unknown> = {}

  for (const field of fields) {
    if (field === 'referral_link') {
      const referralCode = userInfoRecord.referral_code ?? null
      responseBody.referral_link =
        typeof referralCode === 'string' && referralCode.length > 0
          ? getReferralLink(referralCode)
          : null
    } else {
      responseBody[field] = userInfoRecord[field as ValidDbField] ?? null
    }
  }

  return NextResponse.json(responseBody)
}
