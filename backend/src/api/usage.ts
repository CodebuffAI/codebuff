import { Request, Response } from 'express'
import { checkAuth } from '../util/check-auth'
import {
  genUsageResponse,
  getUserIdFromAuthToken,
} from '../websockets/websocket-action'
import { UsageReponseSchema } from 'common/actions'

export async function handler(req: Request, res: Response) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      type: 'action-error',
      message: 'Method not allowed',
    })
  }

  // Get params from request body
  const { fingerprintId, authToken } = req.body

  if (!fingerprintId || !authToken) {
    return res.status(400).json({
      type: 'action-error',
      message: 'Missing fingerprintId or authToken parameter',
    })
  }

  const result = await checkAuth({ fingerprintId, authToken })
  if (result?.type === 'action-error') {
    return res.status(401).json(result)
  }

  const response = await genUsageResponse(
    fingerprintId,
    authToken ? await getUserIdFromAuthToken(authToken) : undefined,
    undefined
  )

  return res.json(response)
}
