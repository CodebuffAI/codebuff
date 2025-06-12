import { logger } from '@/util/logger'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { GitEvalResultRequest } from 'common/src/db/schema'
import { desc } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam, 10) : 100

    // Validate limit parameter
    if (isNaN(limit) || limit <= 0 || limit > 1000) {
      return NextResponse.json(
        { error: 'Limit must be a positive number between 1 and 1000' },
        { status: 400 }
      )
    }

    // Fetch the most recent eval results
    const evalResults = await db
      .select()
      .from(schema.gitEvalResults)
      .orderBy(desc(schema.gitEvalResults.id))
      .limit(limit)

    logger.info(
      {
        count: evalResults.length,
        limit,
      },
      'Retrieved git eval results'
    )

    return NextResponse.json(evalResults)
  } catch (error) {
    logger.error({ error }, 'Error retrieving git eval results')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
