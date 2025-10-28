import { NextRequest, NextResponse } from 'next/server'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq } from 'drizzle-orm'
import { validatePublisherId } from '@/lib/validators/publisher'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { valid: false, error: 'Publisher ID is required' },
        { status: 400 }
      )
    }

    // Validate format first
    const formatError = validatePublisherId(id)
    if (formatError) {
      return NextResponse.json(
        { valid: false, error: formatError },
        { status: 200 }
      )
    }

    // Check if ID is already taken
    const existingPublisher = await db
      .select({ id: schema.publisher.id })
      .from(schema.publisher)
      .where(eq(schema.publisher.id, id))
      .limit(1)

    if (existingPublisher.length > 0) {
      return NextResponse.json(
        { valid: false, error: 'This publisher ID is already taken' },
        { status: 200 }
      )
    }

    return NextResponse.json({ valid: true, error: null }, { status: 200 })
  } catch (error) {
    console.error('Error validating publisher ID:', error)
    return NextResponse.json(
      { valid: false, error: 'Failed to validate publisher ID' },
      { status: 500 }
    )
  }
}
