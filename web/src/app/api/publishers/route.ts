import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq } from 'drizzle-orm'
import {
  CreatePublisherRequest,
  PublisherProfileResponse,
  PublisherIdSchema,
} from '@codebuff/common/types/publisher'
import { logger } from '@/util/logger'

function validatePublisherName(name: string): string | null {
  if (!name || !name.trim()) {
    return 'Publisher name is required'
  }

  const trimmedName = name.trim()

  if (trimmedName.length < 2) {
    return 'Publisher name must be at least 2 characters long'
  }

  if (trimmedName.length > 50) {
    return 'Publisher name must be no more than 50 characters long'
  }

  return null
}

function validatePublisherId(id: string): string | null {
  const result = PublisherIdSchema.safeParse(id)
  if (!result.success) {
    return result.error.errors[0]?.message || 'Invalid publisher ID'
  }

  if (id.length < 3) {
    return 'Publisher ID must be at least 3 characters long'
  }

  if (id.length > 30) {
    return 'Publisher ID must be no more than 30 characters long'
  }

  if (id.startsWith('-') || id.endsWith('-')) {
    return 'Publisher ID cannot start or end with a hyphen'
  }

  return null
}

export async function GET(): Promise<
  NextResponse<PublisherProfileResponse | { error: string }>
> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the user's publisher profile
    const publishers = await db
      .select()
      .from(schema.publisher)
      .where(eq(schema.publisher.user_id, session.user.id))
      .limit(1)

    if (publishers.length === 0) {
      return NextResponse.json(
        { error: 'Publisher profile not found' },
        { status: 404 }
      )
    }

    const publisher = publishers[0]

    // Get agent count for this publisher
    const agentCount = await db
      .select({ count: schema.agentConfig.id })
      .from(schema.agentConfig)
      .where(eq(schema.agentConfig.publisher_id, publisher.id))
      .then((result) => result.length)

    const response: PublisherProfileResponse = {
      ...publisher,
      agentCount,
    }

    return NextResponse.json(response)
  } catch (error) {
    logger.error({ error }, 'Error fetching publisher profile')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user already has a publisher profile
    const existingPublishers = await db
      .select()
      .from(schema.publisher)
      .where(eq(schema.publisher.user_id, session.user.id))
      .limit(1)

    if (existingPublishers.length > 0) {
      return NextResponse.json(
        { error: 'You already have a publisher profile' },
        { status: 400 }
      )
    }

    const body: CreatePublisherRequest = await request.json()
    const { id, name, email, bio, avatar_url } = body

    // Validate publisher ID
    const idValidationError = validatePublisherId(id)
    if (idValidationError) {
      return NextResponse.json({ error: idValidationError }, { status: 400 })
    }

    // Validate publisher name
    const nameValidationError = validatePublisherName(name)
    if (nameValidationError) {
      return NextResponse.json({ error: nameValidationError }, { status: 400 })
    }

    const trimmedName = name.trim()

    // Ensure ID is unique
    const existingPublisher = await db
      .select()
      .from(schema.publisher)
      .where(eq(schema.publisher.id, id))
      .limit(1)

    if (existingPublisher.length > 0) {
      return NextResponse.json(
        { error: 'This publisher ID is already taken' },
        { status: 400 }
      )
    }

    // Create publisher
    const [newPublisher] = await db
      .insert(schema.publisher)
      .values({
        id,
        user_id: session.user.id,
        name: trimmedName,
        email: email?.trim() || null,
        bio: bio?.trim() || null,
        avatar_url: avatar_url?.trim() || null,
        verified: false,
      })
      .returning()

    logger.info(
      {
        publisherId: newPublisher.id,
        userId: session.user.id,
      },
      'Created new publisher profile'
    )

    const response: PublisherProfileResponse = {
      ...newPublisher,
      agentCount: 0,
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    logger.error({ error }, 'Error creating publisher profile')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
