import { z } from 'zod'
import { jsonEndpoint, validate } from './helpers/endpoint'
import { broadcast } from 'shared/websockets/server'

const bodySchema = z.object({
  topic: z.string(),
  message: z.record(z.unknown()),
})

export const broadcastTest = jsonEndpoint(async (req) => {
  const params = validate(bodySchema, req.body)
  broadcast(params.topic, params.message)
  return { success: true }
})
