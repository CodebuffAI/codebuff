import { NextResponse } from 'next/server'

import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type { NextRequest } from 'next/server'

import { getUserInfoFromApiKey, VALID_USER_INFO_FIELDS } from '@/db/user'
import { extractApiKeyFromHeader } from '@/util/auth'

type ValidField = (typeof VALID_USER_INFO_FIELDS)[number]

export async function meGet(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
}) {
  const { req, getUserInfoFromApiKey } = params

  const apiKey = extractApiKeyFromHeader(req)

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing or invalid Authorization header' },
      { status: 401 }
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
          error: `Invalid fields: empty. Valid fields are: ${VALID_USER_INFO_FIELDS.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Validate that all requested fields are valid
    const invalidFields = requestedFields.filter(
      (f) => !VALID_USER_INFO_FIELDS.includes(f as ValidField)
    )
    if (invalidFields.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid fields: ${invalidFields.join(', ')}. Valid fields are: ${VALID_USER_INFO_FIELDS.join(', ')}`,
        },
        { status: 400 }
      )
    }
    fields = requestedFields as ValidField[]
  } else {
    // Default to just 'id'
    fields = ['id']
  }

  // Get user info
  const userInfo = await getUserInfoFromApiKey({ apiKey, fields })

  if (!userInfo) {
    return NextResponse.json(
      { error: 'Invalid API key or user not found' },
      { status: 404 }
    )
  }

  return NextResponse.json(userInfo)
}

export async function GET(req: NextRequest) {
  return meGet({ req, getUserInfoFromApiKey })
}
