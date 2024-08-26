import { ENV_CONFIG } from 'common/envs/constants'
import { API, APIPath } from './schema'

type ErrorCode =
  | 400 // your input is bad (like zod is mad)
  | 401 // you aren't logged in / your account doesn't exist
  | 403 // you aren't allowed to do it
  | 404 // we can't find it
  | 429 // you're too much for us
  | 500 // we fucked up
  | 503 // we're too busy to handle your request

export class APIError extends Error {
  code: ErrorCode
  details?: unknown
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.code = code
    this.name = 'APIError'
    this.details = details
  }
}

export function getCloudRunServiceUrl(name: string) {
  const { cloudRunId, cloudRunRegion } = ENV_CONFIG
  return `https://${name}-${cloudRunId}-${cloudRunRegion}.a.run.app`
}

export function pathWithPrefix(path: APIPath) {
  return API[path].visibility === 'public' ? `v0/${path}` : path
}

export function getWebsocketUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return `ws://${process.env.NEXT_PUBLIC_API_URL}/ws`
  } else {
    const { apiEndpoint } = ENV_CONFIG
    return `wss://${apiEndpoint}/ws`
  }
}

// TODO: strictly type
export function getApiUrl(path: string) {
  if (path in API) {
    path = pathWithPrefix(path as APIPath)
  }

  if (process.env.NEXT_PUBLIC_API_URL) {
    return `http://${process.env.NEXT_PUBLIC_API_URL}/${path}`
  } else {
    const { apiEndpoint } = ENV_CONFIG
    return `https://${apiEndpoint}/${path}`
  }
}
