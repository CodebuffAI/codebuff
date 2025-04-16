import db from 'common/db'
import * as schema from 'common/db/schema'
import { ApiKeyType } from 'common/src/api-keys/constants'
import { encryptAndStoreApiKey } from 'common/src/api-keys/crypto'
import { apiKeyTypeEnum, encryptedApiKeys } from 'common/src/db/schema'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { logger } from '@/util/logger'

export async function GET(request: NextRequest) {
  const authHeader = await request.headers.get('authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 })
  }

  const authToken = authHeader.split(' ')[1]
  const user = await db.query.session.findFirst({
    where: eq(schema.session.sessionToken, authToken),
    columns: {
      userId: true,
    },
  })

  const userId = user?.userId

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const storedKeys = await db
      .select({ type: encryptedApiKeys.type })
      .from(encryptedApiKeys)
      .where(eq(encryptedApiKeys.user_id, userId))

    const keyTypes: ApiKeyType[] = storedKeys.map((key) => key.type)

    logger.info(
      { userId, keyTypes },
      'Successfully retrieved stored API key types'
    )
    return NextResponse.json({ keyTypes }, { status: 200 })
  } catch (error) {
    logger.error({ error, userId }, 'Failed to retrieve stored API key types')
    return NextResponse.json(
      { error: 'Failed to retrieve API key types' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const reqJson = await request.json()
  const parsedJson = z
    .object({
      keyType: z.enum(apiKeyTypeEnum.enumValues),
      apiKey: z.string().min(1, 'API key cannot be empty'),
      authToken: z.string(),
    })
    .safeParse(reqJson)

  if (!parsedJson.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { keyType, apiKey, authToken } = parsedJson.data
  const user = await db.query.session.findFirst({
    where: eq(schema.session.sessionToken, authToken),
    columns: {
      userId: true,
    },
  })

  const userId = user?.userId

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await encryptAndStoreApiKey(userId, keyType, apiKey)
    logger.info({ userId, keyType }, 'Successfully stored API key')
    return NextResponse.json(
      { message: `${keyType} API key stored successfully` },
      { status: 200 }
    )
  } catch (error) {
    logger.error({ error, userId, keyType }, 'Failed to store API key')
    return NextResponse.json(
      { error: 'Failed to store API key' },
      { status: 500 }
    )
  }
}
