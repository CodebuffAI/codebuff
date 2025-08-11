import { validateAgents } from '@codebuff/common/templates/agent-validation'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { logger } from '@/util/logger'

import type { NextRequest } from 'next/server'

interface ValidateAgentsRequest {
  agentConfigs: Record<string, any>
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as ValidateAgentsRequest
    const { agentConfigs } = body

    if (!agentConfigs || typeof agentConfigs !== 'object') {
      return NextResponse.json(
        {
          error:
            'Invalid request: agentConfigs must be an object, with keys being the agent IDs and values of type AgentConfig',
        },
        { status: 400 }
      )
    }

    const { templates: configs, validationErrors } = validateAgents(agentConfigs)

    if (validationErrors.length > 0) {
      logger.warn(
        { errorCount: validationErrors.length, userId: session.user.id },
        'Agent config validation errors found',
      )
    }

    return NextResponse.json({
      success: true,
      configs: Object.keys(configs),
      validationErrors,
      errorCount: validationErrors.length,
    })
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error validating agent configs',
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
