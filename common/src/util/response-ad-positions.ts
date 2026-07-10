/**
 * Where to intersperse ads inside a streamed assistant response.
 *
 * Nodes are append-only while streaming, so an after-node index is a stable
 * anchor. Ads only occupy positions with a following node and never trail the
 * response.
 */

/** Rendered nodes between interspersed ads. */
export const RESPONSE_AD_NODE_STEP = 2

/** Number of non-trailing ad slots currently eligible in a response. */
export function responseAdSlotCount(params: {
  nodeCount: number
  step?: number
}): number {
  const step = Math.max(1, params.step ?? RESPONSE_AD_NODE_STEP)
  return Math.max(0, Math.floor((params.nodeCount - 1) / step))
}

/** After-node indices for up to `adCount` ads given the current node count. */
export function responseAdNodePositions(params: {
  nodeCount: number
  adCount: number
  step?: number
}): number[] {
  const { nodeCount, adCount } = params
  const step = Math.max(1, params.step ?? RESPONSE_AD_NODE_STEP)
  const positions: number[] = []
  const eligibleCount = Math.min(
    Math.max(0, adCount),
    responseAdSlotCount({ nodeCount, step }),
  )
  for (let k = 0; k < eligibleCount; k++) {
    positions.push((k + 1) * step - 1)
  }
  return positions
}
