import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ValidationError } from './_types'
import { validate } from './_validate'

const queryParams = z
  .object({
    // This secret is stored in both Firebase and Vercel's environment variables, as API_SECRET.
    apiSecret: z.string(),
    // Path after domain: e.g. "/JamesGrugett/will-pete-buttigieg-ever-be-us-pres"
    pathToRevalidate: z.string(),
  })
  .strict()

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  let params: z.infer<typeof queryParams>
  try {
    params = validate(queryParams, req.query)
  } catch (e) {
    if (e instanceof ValidationError) {
      return res.status(400).json(e)
    }
    console.error(`Unknown error during validation: ${e}`)
    return res.status(500).json({
      error: e,
      message:
        typeof e === 'object' && e && 'message' in e
          ? e.message
          : 'Unknown error revalidating',
    })
  }

  const { apiSecret, pathToRevalidate } = params

  if (apiSecret !== process.env.API_SECRET) {
    return res.status(401).json({ message: 'Invalid api secret' })
  }

  return await res
    .revalidate(pathToRevalidate)
    .then(() => {
      return res.json({ revalidated: true })
    })
    .catch((err) => {
      console.error('Error revalidating:', err)
      return res.status(500).json({
        error: err,
        message:
          typeof err === 'object' && err && 'message' in err
            ? err.message
            : 'Unknown error revalidating',
      })
    })
}
