import { handleOpenrouterStream } from '../../../llm-apis/openrouter'
import { extractAuthTokenFromHeader } from '../../../util/auth-helpers'
import { getUserIdFromAuthToken } from '../../../websockets/auth'

import type { Request, Response } from 'express'

export async function completionsStreamHandler(req: Request, res: Response) {
  console.log('asdf', { req: { headers: req.headers, body: req.body } })
  const token = extractAuthTokenFromHeader(req)
  if (!token) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }
  const userId = await getUserIdFromAuthToken(token)
  if (!userId) {
    res.status(401).json({ message: 'Invalid Codebuff API key' })
    return
  }

  if (req.body.stream) {
    return await handleOpenrouterStream({ req, res, userId })
  }
  res.status(500).json({ message: 'Not implemented. Use stream=true.' })
}
