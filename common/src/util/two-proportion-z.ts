/**
 * How many standard errors `current` is BELOW `baseline` (two-proportion z,
 * pooled). Positive = a drop. Infinity when both are certain and differ.
 * Shared by the skill-health alert and the bench's receipt comparison.
 */
export function dropZ(
  baseline: { hits: number; n: number },
  current: { hits: number; n: number },
): number {
  if (baseline.n === 0 || current.n === 0) return 0
  const p1 = baseline.hits / baseline.n
  const p2 = current.hits / current.n
  const pooled = (baseline.hits + current.hits) / (baseline.n + current.n)
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / baseline.n + 1 / current.n))
  if (se === 0) return p1 > p2 ? Infinity : 0
  return (p1 - p2) / se
}
