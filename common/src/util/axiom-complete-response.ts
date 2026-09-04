/**
 * The one Axiom completeness guard (COD-407).
 *
 * Axiom answers a query it could not finish with `status.isPartial: true` and
 * a perfectly well-formed body, so a caller that only checks the HTTP status
 * will happily persist a truncated window as if it were the whole thing.
 * Anything that MATERIALIZES an Axiom answer -- the hourly rollups, whose
 * stored zeros are later read as fact; the alert incident store; the
 * opportunity-volume backfill -- must refuse a partial one.
 *
 * `isPartial !== false` rather than `=== true`, deliberately: a response
 * carrying no status at all is not evidence of completeness either. Four
 * copies of exactly that predicate existed; this is the one. The ERROR each
 * caller raises stays with the caller, because each names its own context and
 * remedy (re-run the day, narrow the query, refuse to store).
 */

/** True only when Axiom itself says the answer is complete. */
export function isCompleteAxiomResponse(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const status = (value as { status?: unknown }).status
  if (!status || typeof status !== 'object') return false
  return (status as { isPartial?: unknown }).isPartial === false
}

/**
 * Throws `${context}: <reason>` unless the answer is complete. For callers
 * whose only decision is "store it or not".
 */
export function assertCompleteAxiomResponse(
  value: unknown,
  context: string,
): void {
  if (!isCompleteAxiomResponse(value)) {
    throw new Error(
      `${context}: Axiom returned a partial or statusless answer; refusing to store it.`,
    )
  }
}
