/**
 * Time a request spent between the ingress proxy and our handler ("queue
 * time"). Server-side timers all start after dequeue, so instance-level
 * backpressure (event-loop lag, accept-queue wait) is invisible without this:
 * during the 2026-07 peak-hours incident, per-agent-step wall time tripled
 * while every handler-measured latency stayed flat.
 *
 * Reads the `X-Request-Start` timestamp set by the proxy (Render/Heroku/nginx
 * convention). Returns undefined when the header is absent or unparseable —
 * callers must treat queue time as strictly best-effort.
 */

const MAX_PLAUSIBLE_QUEUE_MS = 10 * 60 * 1000

export function queueTimeMsFromHeaders(headers: {
  get(name: string): string | null
}): number | undefined {
  const raw = headers.get('x-request-start')
  if (!raw) return undefined

  // Formats in the wild: "t=1234567890.123" (nginx, seconds), bare epoch in
  // seconds / milliseconds / microseconds / nanoseconds. Normalize by
  // magnitude rather than trusting any one proxy's docs.
  const numeric = Number.parseFloat(raw.startsWith('t=') ? raw.slice(2) : raw)
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined

  let startMs: number
  if (numeric < 1e11) {
    startMs = numeric * 1000 // seconds (fractional ok)
  } else if (numeric < 1e14) {
    startMs = numeric // milliseconds
  } else if (numeric < 1e17) {
    startMs = numeric / 1000 // microseconds
  } else {
    startMs = numeric / 1e6 // nanoseconds
  }

  const queueMs = Date.now() - startMs
  // Clock skew or a garbage header can produce negative or absurd values;
  // drop those rather than pollute the metric.
  if (queueMs < 0 || queueMs > MAX_PLAUSIBLE_QUEUE_MS) return undefined
  return Math.round(queueMs)
}

/**
 * Declared request body size from `Content-Length`, for disambiguating
 * `queueMs`: X-Request-Start is stamped when headers arrive, so queue time
 * folds in the time to receive the body. Chat-completion bodies (full message
 * history) are large, so a big queueMs can be slow upload rather than
 * instance backpressure. Logging both lets us tell them apart. Returns
 * undefined when the header is absent or unparseable (e.g. chunked transfer).
 */
// A body larger than this over the JSON API is bogus (spoofed/garbage header),
// not a real request — drop it rather than log a misleading giant number.
const MAX_PLAUSIBLE_CONTENT_BYTES = 1024 * 1024 * 1024 // 1 GiB

export function requestContentBytesFromHeaders(headers: {
  get(name: string): string | null
}): number | undefined {
  const raw = headers.get('content-length')?.trim()
  // Content-Length is `1*DIGIT` per HTTP. Require exactly that so a malformed
  // value ("0x10", "1e6", "123abc") is dropped as unparseable rather than
  // silently partial-parsed by parseInt into a wrong, plausible-looking number.
  if (!raw || !/^\d+$/.test(raw)) return undefined
  const bytes = Number(raw)
  if (!Number.isFinite(bytes) || bytes > MAX_PLAUSIBLE_CONTENT_BYTES) {
    return undefined
  }
  return bytes
}
