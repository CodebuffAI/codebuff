import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { logger } from '@/util/logger'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { GitEvalResultRequest } from 'common/src/db/schema'
import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: GitEvalResultRequest = await request.json()
    const { cost_mode, reasoner_model, agent_model, metadata, cost } = body

    // Insert the eval result into the   database
    const [newEvalResult] = await db
      .insert(schema.gitEvalResults)
      .values({
        cost_mode,
        reasoner_model,
        agent_model,
        metadata,
        cost,
        is_public: false,
      })
      .returning()

    logger.info(
      {
        evalResultId: newEvalResult.id,
        userId: session.user.id,
        reasoner_model,
        agent_model,
      },
      'Created new git eval result'
    )

    return NextResponse.json(newEvalResult, { status: 201 })
  } catch (error) {
    logger.error({ error }, 'Error creating git eval result')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
