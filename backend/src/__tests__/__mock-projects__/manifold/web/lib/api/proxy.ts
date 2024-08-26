import { PROD_CONFIG } from 'common/envs/prod'
import { NextRequest } from 'next/server'

// copied from common/src/utils/api. TODO the right thing
function getApiUrl(path: string) {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return `http://${process.env.NEXT_PUBLIC_API_URL}/${path}`
  } else {
    const { apiEndpoint } = PROD_CONFIG
    return `https://${apiEndpoint}/${path}`
  }
}

function getProxiedRequestUrl(req: NextRequest, path: string) {
  const baseUrl = getApiUrl(path)
  const [_prefix, qs] = req.url!.split('?', 2)
  if (qs) {
    return baseUrl + '?' + qs
  } else {
    return baseUrl
  }
}

function getProxiedRequestHeaders(req: NextRequest, whitelist: string[]) {
  const result = new Headers()
  for (const name of whitelist) {
    const v = req.headers.get(name.toLowerCase())
    if (Array.isArray(v)) {
      for (const vv of v) {
        result.append(name, vv)
      }
    } else if (v != null) {
      result.append(name, v)
    }
  }
  // mqp: the backend uses this in the cloud armor rules to bypass GCP throttling
  result.append('X-Vercel-Proxy-Secret', process.env.VERCEL_PROXY_SECRET ?? '')
  result.append('X-Forwarded-For', req.ip ?? '')
  result.append('Via', 'Vercel public API')
  return result
}

export const fetchBackend = (req: NextRequest, path: string) => {
  const url = getProxiedRequestUrl(req, path)
  const headers = getProxiedRequestHeaders(req, [
    'Authorization',
    'Content-Type',
    'Origin',
  ])
  const hasBody = req.method != 'HEAD' && req.method != 'GET'
  const opts = {
    headers,
    method: req.method,
    duplex: 'half',
    body: hasBody ? req.body : null,
  }
  return fetch(url, opts)
}
