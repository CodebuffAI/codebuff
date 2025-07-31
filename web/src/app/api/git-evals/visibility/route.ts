import { db } from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

import { checkAdminAuth } from '@/lib/admin-auth'
import { logger } from '@/util/logger'

export async function PATCH(request: NextRequest) {
  try {
    // Check admin authentication
    const authResult = await checkAdminAuth()
    if (authResult instanceof NextResponse) {
      return authResult
    }

    const body = await request.json()
    const { id, is_public } = body

    // Validate request body
    if (!id || typeof is_public !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing or invalid required fields: id, is_public' },
        { status: 400 }
      )
    }

    // Update the eval result visibility
    const [updatedResult] = await db
      .update(schema.gitEvalResults)
      .set({ is_public })
      .where(eq(schema.gitEvalResults.id, id))
      .returning()

    if (!updatedResult) {
      return NextResponse.json(
        { error: 'Eval result not found' },
        { status: 404 }
      )
    }

    logger.info(
      {
        evalResultId: id,
        is_public,
        adminUserId: authResult.id,
      },
      'Updated eval result visibility'
    )

    return NextResponse.json(updatedResult)
  } catch (error) {
    logger.error({ error }, 'Error updating eval result visibility')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
