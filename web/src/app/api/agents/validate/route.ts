import { validateAgents } from '@codebuff/common/templates/agent-validation'
import { NextResponse } from 'next/server'

import { logger } from '@/util/logger'

import type { NextRequest } from 'next/server'

interface ValidateAgentsRequest {
  agentConfigs: any[]
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as ValidateAgentsRequest
    const { agentConfigs } = body

    if (!agentConfigs || !Array.isArray(agentConfigs)) {
      return NextResponse.json(
        {
          error:
            'Invalid request: agentConfigs must be an array of AgentConfig objects',
        },
        { status: 400 }
      )
    }

    const configsObject = Object.fromEntries(
      agentConfigs.map((config) => [config.id, config])
    )
    const { templates: configs, validationErrors } =
      validateAgents(configsObject)

    if (validationErrors.length > 0) {
      logger.warn(
        { errorCount: validationErrors.length },
        'Agent config validation errors found'
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
      'Error validating agent configs'
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
