import '@testing-library/jest-dom'
import { TextDecoder, TextEncoder } from 'node:util'
import { ReadableStream, WritableStream, TransformStream } from 'node:stream/web'

const TEST_ENV_DEFAULTS = {
  CI: 'true',
  NODE_ENV: 'test',
  NEXT_PUBLIC_CB_ENVIRONMENT: 'test',
  NEXT_PUBLIC_CODEBUFF_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_SUPPORT_EMAIL: 'support@openbuff.local',
  NEXT_PUBLIC_POSTHOG_API_KEY: 'test-posthog-key',
  NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://us.i.posthog.com',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_placeholder',
  NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL:
    'https://billing.stripe.com/p/login/test_placeholder',
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID: 'test-verification',
  NEXT_PUBLIC_WEB_PORT: '3000',
}

for (const [key, value] of Object.entries(TEST_ENV_DEFAULTS)) {
  if (!process.env[key]) {
    process.env[key] = value
  }
}

// JSDOM lacks Node's Web API globals — undici (loaded transitively via
// `next/server` and `openai`) needs these at module-load time.
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder
}
if (typeof globalThis.ReadableStream === 'undefined') {
  globalThis.ReadableStream = ReadableStream
  globalThis.WritableStream = WritableStream
  globalThis.TransformStream = TransformStream
}
if (typeof globalThis.Request === 'undefined') {
  const undici = require('undici')
  globalThis.Request = undici.Request
  globalThis.Response = undici.Response
  globalThis.Headers = undici.Headers
  globalThis.fetch = undici.fetch
  globalThis.FormData = undici.FormData
}
