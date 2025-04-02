import { encryptAndStoreApiKey } from 'common/src/api-keys/crypto'
import { apiKeyTypeEnum } from 'common/src/db/schema'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { logger } from '@/util/logger'

// Define the schema for the request body
const ApiKeySchema = z.object({
  keyType: z.enum(apiKeyTypeEnum.enumValues),
  apiKey: z.string().min(1, 'API key cannot be empty'),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  let reqBody: z.infer<typeof ApiKeySchema>
  try {
    reqBody = await req.json()
    ApiKeySchema.parse(reqBody) // Validate the request body
  } catch (error) {
    logger.error({ error, userId }, 'Invalid request body for adding API key')
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to parse request body' },
      { status: 400 }
    )
  }

  const { keyType, apiKey } = reqBody

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
