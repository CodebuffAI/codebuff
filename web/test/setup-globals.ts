/**
 * Polyfill web globals for Bun tests that import Next.js server modules.
 *
 * Next.js's `next/server` module (NextRequest, NextResponse) expects the
 * standard web globals (Request, Response, Headers, fetch) to exist.
 * Bun provides these in its runtime, but they may not be available at
 * module load time during tests.
 *
 * This preload script ensures these globals are set up before any test
 * modules are imported.
 */

// Bun has built-in support for web APIs, but we need to ensure they're
// available on globalThis for Next.js server modules
if (typeof globalThis.Request === 'undefined') {
  globalThis.Request = Request
}

if (typeof globalThis.Response === 'undefined') {
  globalThis.Response = Response
}

if (typeof globalThis.Headers === 'undefined') {
  globalThis.Headers = Headers
}

if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = fetch
}
