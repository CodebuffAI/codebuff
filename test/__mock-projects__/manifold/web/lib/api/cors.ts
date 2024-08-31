import Cors from 'cors'
import { NextApiRequest, NextApiResponse } from 'next'

export function applyCorsHeaders(
  req: NextApiRequest,
  res: NextApiResponse,
  params?: Cors.CorsOptions
) {
  // This cors module is made as express.js middleware, so it's easier to promisify it for ourselves.
  return new Promise((resolve, reject) => {
    Cors(params ?? CORS_UNRESTRICTED)(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result)
      }
      return resolve(result)
    })
  })
}

export const CORS_UNRESTRICTED = {}
