import { createHmac } from 'crypto'

import type { VlyRunEvent, VlyToolRequest } from './types'

function callbackHeaders(params: {
  body: string
  bearerToken?: string
  callbackSecret?: string
}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (params.bearerToken) {
    headers.Authorization = `Bearer ${params.bearerToken}`
  }

  if (params.callbackSecret) {
    const timestamp = Date.now().toString()
    headers['x-vly-timestamp'] = timestamp
    headers['x-vly-signature'] = createHmac('sha256', params.callbackSecret)
      .update(`${timestamp}.${params.body}`)
      .digest('hex')
  }

  return headers
}

export async function postVlyRunEvent(params: {
  url: string
  event: VlyRunEvent
  bearerToken?: string
  callbackSecret?: string
}) {
  const body = JSON.stringify(params.event)
  const response = await fetch(params.url, {
    method: 'POST',
    headers: callbackHeaders({
      body,
      bearerToken: params.bearerToken,
      callbackSecret: params.callbackSecret,
    }),
    body,
  })

  if (!response.ok) {
    throw new Error(
      `Vly event callback failed (${response.status}): ${await response.text()}`,
    )
  }
}

export async function postVlyToolRequest(params: {
  url: string
  request: VlyToolRequest
  bearerToken?: string
  callbackSecret?: string
}) {
  const body = JSON.stringify(params.request)
  const response = await fetch(params.url, {
    method: 'POST',
    headers: callbackHeaders({
      body,
      bearerToken: params.bearerToken,
      callbackSecret: params.callbackSecret,
    }),
    body,
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Vly tool callback failed (${response.status}): ${text}`)
  }

  return text ? JSON.parse(text) : undefined
}
