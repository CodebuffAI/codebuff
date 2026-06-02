/** Premium-session counts come back from the server as `recentCount` units
 *  that may be fractional (a long agent run can consume 1.3 sessions). Render
 *  integers without a trailing `.0`, fractionals at one decimal — matches the
 *  `limit` field which is always integer. */
export const formatSessionUnits = (units: number): string =>
  Number.isInteger(units) ? String(units) : units.toFixed(1)
