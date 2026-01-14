import { validateAgentsWithSpawnableAgents } from '@codebuff/internal/templates/agent-validation'
import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

import { logger } from '@/util/logger'

interface ValidateAgentsRequest {
  agentConfigs?: any[]
  agentDefinitions?: any[]
  allLocalAgentIds?: string[]
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const requestBody = await request.json()
    const body = requestBody as ValidateAgentsRequest
    const { agentConfigs } = body
    let { agentDefinitions } = body

    if (!agentDefinitions || !Array.isArray(agentDefinitions)) {
      agentDefinitions = agentConfigs
    }

    if (!agentDefinitions || !Array.isArray(agentDefinitions)) {
      return NextResponse.json(
        {
          error:
            'Invalid request: agentDefinitions must be an array of AgentDefinition objects',
        },
        { status: 400 },
      )
    }

    const definitionsObject = Object.fromEntries(
      agentDefinitions.map((config) => [config.id, config]),
    )
    const { templates: configs, validationErrors } =
      await validateAgentsWithSpawnableAgents({
        agentTemplates: definitionsObject,
        allLocalAgentIds: body.allLocalAgentIds,
        logger,
      })

    if (validationErrors.length > 0) {
      logger.warn(
        { errorCount: validationErrors.length },
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
      'Error validating agent definitions',
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
