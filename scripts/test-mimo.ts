#!/usr/bin/env bun

import os from 'os'
import path from 'path'

import dotenv from 'dotenv'

dotenv.config({
  path: [
    path.join(process.cwd(), '.env.local'),
    path.join(os.homedir(), 'freebuff-private', '.env.local'),
  ],
  quiet: true,
})

const apiKey = process.env.MIMO_API_KEY

if (!apiKey) {
  console.error('MIMO_API_KEY is not configured')
  process.exit(1)
}

const response = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'api-key': apiKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'mimo-v2.5-pro',
    messages: [
      {
        role: 'system',
        content:
          'You are a concise API smoke-test assistant. Reply with one short sentence.',
      },
      {
        role: 'user',
        content: 'Say hello and include the word mimo-smoke.',
      },
    ],
    max_completion_tokens: 64,
    temperature: 0.2,
    stream: false,
    thinking: { type: 'disabled' },
  }),
})

const text = await response.text()
let data: unknown
try {
  data = JSON.parse(text)
} catch {
  data = text
}

if (!response.ok) {
  console.error(
    JSON.stringify(
      {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data,
      },
      null,
      2,
    ),
  )
  process.exit(1)
}

const body = data as {
  id?: string
  model?: string
  choices?: Array<{ message?: { content?: string } }>
  usage?: unknown
}

console.log(
  JSON.stringify(
    {
      ok: true,
      status: response.status,
      id: body.id,
      model: body.model,
      content: body.choices?.[0]?.message?.content,
      usage: body.usage,
    },
    null,
    2,
  ),
)
