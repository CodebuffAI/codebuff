/**
 * Rolling, per-pod record of observed time-to-first-token (TTFT) for requests
 * actually served by a Fireworks *custom deployment* (not the serverless API).
 *
 * Why this exists: a dedicated deployment's health shows up in user experience
 * as TTFT long before the coarse Fireworks Prometheus counters (KV-cache
 * saturation, 5xx rate) move. We already measure true end-to-end TTFT on every
 * streamed request; this module accumulates those measurements so the
 * free-session router can shed *new* sessions to the serverless backup once the
 * deployment's recent p90 TTFT crosses a threshold — without a waiting room.
 *
 * Per-pod, in-memory by design — it mirrors the per-pod caching of the Fireworks
 * health probe (`fireworks-health.ts`). Each web pod serves both chat
 * completions (which record here) and session POSTs (which read here), so a
 * busy pod always has a representative sample of the deployment requests it
 * handled. At low load a pod may have too few samples to judge (→ `undefined`,
 * no TTFT-based trip); that's fine because the deployment isn't stressed then,
 * and the Prometheus-based health signal remains the always-available backstop.
 *
 * Recovery is self-correcting: sessions already pinned to the deployment stay
 * there (sticky) and keep recording TTFT, so as the deployment cools their p90
 * falls back under the threshold and new sessions flow back to it.
 */

/** Only samples newer than this count toward the rolling p90, so the signal
 *  decays after the deployment recovers instead of staying tripped. */
export const TTFT_WINDOW_MS = 2 * 60 * 1000

/** Need at least this many samples in the window before the p90 is trustworthy.
 *  Below it, `deploymentTtftP90Ms` returns undefined (no TTFT-based decision). */
export const TTFT_MIN_SAMPLES = 10

/** Hard cap on retained samples per model. Recording is a plain push (no
 *  per-sample pruning), so this cap is what bounds the buffer if reads — which
 *  do the time-windowing — go quiet for a while. */
const TTFT_MAX_SAMPLES = 2000

/** Pin new sessions to serverless when the deployment's recent p90 TTFT exceeds
 *  this. 1.5s is the point past which the first token feels sluggish. */
export const TTFT_SERVERLESS_THRESHOLD_MS = 1500

type Sample = { t: number; ttftMs: number }

const samplesByModel = new Map<string, Sample[]>()

/** Record one deployment-served TTFT measurement (ms). On the chat-completions
 *  hot path, so it's a plain O(1) push; the time window is applied lazily on
 *  read. We only pay to trim when the buffer exceeds its hard cap (a read
 *  drought), keeping records amortized O(1). No-op for non-finite/negative. */
export function recordDeploymentTtftMs(
  model: string,
  ttftMs: number,
  now: number = Date.now(),
): void {
  if (!Number.isFinite(ttftMs) || ttftMs < 0) return
  let samples = samplesByModel.get(model)
  if (!samples) {
    samples = []
    samplesByModel.set(model, samples)
  }
  samples.push({ t: now, ttftMs })
  if (samples.length > TTFT_MAX_SAMPLES) {
    samples.splice(0, samples.length - TTFT_MAX_SAMPLES)
  }
}

/** p90 of deployment TTFT (ms) over the rolling window, or undefined when there
 *  aren't enough recent samples to judge. Nearest-rank percentile. Read-only —
 *  windows the samples locally without mutating the shared buffer. */
export function deploymentTtftP90Ms(
  model: string,
  now: number = Date.now(),
): number | undefined {
  const samples = samplesByModel.get(model)
  if (!samples) return undefined
  const cutoff = now - TTFT_WINDOW_MS
  const recent = samples.filter((s) => s.t >= cutoff)
  if (recent.length < TTFT_MIN_SAMPLES) return undefined
  const sorted = recent.map((s) => s.ttftMs).sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil(0.9 * sorted.length) - 1)
  return sorted[idx]
}

export function __resetFireworksTtftForTests(): void {
  samplesByModel.clear()
}
