import * as admin from 'firebase-admin'
import { z } from 'zod'
import { Request, Response, NextFunction } from 'express'

import { PrivateUser } from 'common/user'
import { APIError } from 'common//api/utils'
export { APIError } from 'common//api/utils'
import {
  API,
  APIPath,
  APIResponseOptionalContinue,
  APISchema,
  ValidatedAPIParams,
} from 'common/api/schema'
import { log } from 'shared/utils'
import { getPrivateUserByKey } from 'shared/utils'

export type Json = Record<string, unknown> | Json[]
export type JsonHandler<T extends Json> = (
  req: Request,
  res: Response
) => Promise<T>
export type AuthedHandler<T extends Json> = (
  req: Request,
  user: AuthedUser,
  res: Response
) => Promise<T>
export type MaybeAuthedHandler<T extends Json> = (
  req: Request,
  user: AuthedUser | undefined,
  res: Response
) => Promise<T>

export type AuthedUser = {
  uid: string
  creds: JwtCredentials | (KeyCredentials & { privateUser: PrivateUser })
}
type JwtCredentials = { kind: 'jwt'; data: admin.auth.DecodedIdToken }
type KeyCredentials = { kind: 'key'; data: string }
type Credentials = JwtCredentials | KeyCredentials

export const parseCredentials = async (req: Request): Promise<Credentials> => {
  const auth = admin.auth()
  const authHeader = req.get('Authorization')
  if (!authHeader) {
    throw new APIError(401, 'Missing Authorization header.')
  }
  const authParts = authHeader.split(' ')
  if (authParts.length !== 2) {
    throw new APIError(401, 'Invalid Authorization header.')
  }

  const [scheme, payload] = authParts
  switch (scheme) {
    case 'Bearer':
      if (payload === 'undefined') {
        throw new APIError(401, 'Firebase JWT payload undefined.')
      }
      try {
        return { kind: 'jwt', data: await auth.verifyIdToken(payload) }
      } catch (err) {
        // This is somewhat suspicious, so get it into the firebase console
        console.error('Error verifying Firebase JWT: ', err, scheme, payload)
        throw new APIError(500, 'Error validating token.')
      }
    case 'Key':
      return { kind: 'key', data: payload }
    default:
      throw new APIError(401, 'Invalid auth scheme; must be "Key" or "Bearer".')
  }
}

export const lookupUser = async (creds: Credentials): Promise<AuthedUser> => {
  switch (creds.kind) {
    case 'jwt': {
      if (typeof creds.data.user_id !== 'string') {
        throw new APIError(401, 'JWT must contain Manifold user ID.')
      }
      return { uid: creds.data.user_id, creds }
    }
    case 'key': {
      const key = creds.data
      const privateUser = await getPrivateUserByKey(key)
      if (!privateUser) {
        throw new APIError(401, `No private user exists with API key ${key}.`)
      }
      return { uid: privateUser.id, creds: { privateUser, ...creds } }
    }
    default:
      throw new APIError(401, 'Invalid credential type.')
  }
}

export const validate = <T extends z.ZodTypeAny>(schema: T, val: unknown) => {
  const result = schema.safeParse(val)
  if (!result.success) {
    const issues = result.error.issues.map((i) => {
      return {
        field: i.path.join('.') || null,
        error: i.message,
      }
    })
    if (issues.length > 0) {
      log.error(issues.map((i) => `${i.field}: ${i.error}`).join('\n'))
    }
    throw new APIError(400, 'Error validating request.', issues)
  } else {
    return result.data as z.infer<T>
  }
}

export const jsonEndpoint = <T extends Json>(fn: JsonHandler<T>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json(await fn(req, res))
    } catch (e) {
      next(e)
    }
  }
}

export const authEndpoint = <T extends Json>(fn: AuthedHandler<T>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authedUser = await lookupUser(await parseCredentials(req))
      res.status(200).json(await fn(req, authedUser, res))
    } catch (e) {
      next(e)
    }
  }
}

export const MaybeAuthedEndpoint = <T extends Json>(
  fn: MaybeAuthedHandler<T>
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    let authUser: AuthedUser | undefined = undefined
    try {
      authUser = await lookupUser(await parseCredentials(req))
    } catch {
      // it's treated as an anon request
    }

    try {
      res.status(200).json(await fn(req, authUser, res))
    } catch (e) {
      next(e)
    }
  }
}

export type APIHandler<N extends APIPath> = (
  props: ValidatedAPIParams<N>,
  auth: APISchema<N> extends { authed: true }
    ? AuthedUser
    : AuthedUser | undefined,
  req: Request
) => Promise<APIResponseOptionalContinue<N>>

export const typedEndpoint = <N extends APIPath>(
  name: N,
  handler: APIHandler<N>
) => {
  const { props: propSchema, authed: authRequired, method } = API[name]

  return async (req: Request, res: Response, next: NextFunction) => {
    let authUser: AuthedUser | undefined = undefined
    try {
      authUser = await lookupUser(await parseCredentials(req))
    } catch (e) {
      if (authRequired) return next(e)
    }

    const props = {
      ...(method === 'GET' ? req.query : req.body),
      ...req.params,
    }

    try {
      const resultOptionalContinue = await handler(
        validate(propSchema, props),
        authUser as AuthedUser,
        req
      )

      const hasContinue =
        resultOptionalContinue &&
        'continue' in resultOptionalContinue &&
        'result' in resultOptionalContinue
      const result = hasContinue
        ? resultOptionalContinue.result
        : resultOptionalContinue

      if (!res.headersSent) {
        // Convert bigint to number, b/c JSON doesn't support bigint.
        const convertedResult = deepConvertBigIntToNumber(result)

        res.status(200).json(convertedResult ?? { success: true })
      }

      if (hasContinue) {
        await resultOptionalContinue.continue()
      }
    } catch (error) {
      next(error)
    }
  }
}

const deepConvertBigIntToNumber = (obj: any): any => {
  if (typeof obj === 'bigint') {
    return Number(obj)
  } else if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      obj[key] = deepConvertBigIntToNumber(value)
    }
  }
  return obj
}
