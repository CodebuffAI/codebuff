import { APIError, APIHandler } from 'api/helpers/endpoint'
import { APIPath } from 'common/api/schema'

export const rateLimitByUser = <N extends APIPath>(
  f: APIHandler<N>,
  maxCalls = 10
) => {
  const rateLimit = new Map<string, number>()

  return async (props: any, auth: any, req: any) => {
    const key = auth.uid
    const lastCalled = rateLimit.get(key) || 0

    if (lastCalled >= maxCalls) {
      throw new APIError(429, 'Rate limit exceeded')
    }

    rateLimit.set(key, lastCalled + 1)

    return f(props, auth, req)
  }
}
