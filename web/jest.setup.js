import '@testing-library/jest-dom'
import { TextDecoder, TextEncoder } from 'node:util'
import { ReadableStream, WritableStream, TransformStream } from 'node:stream/web'

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
