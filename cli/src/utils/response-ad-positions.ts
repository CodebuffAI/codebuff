/**
 * Where to intersperse ads inside a streamed assistant response.
 *
 * The response renders as a sequence of nodes (text sections, tool groups,
 * thinking blocks, ...). Nodes are append-only while streaming — a node never
 * changes its index once rendered — so "after node i" is a stable anchor.
 * An ad is only placed *between* nodes (the anchor must have a following
 * node), never at the very bottom, so it reads as interspersed rather than
 * trailing, and short responses naturally use fewer ads.
 */

/** Rendered nodes between interspersed ads (ad after every STEP-th node). */
export const RESPONSE_AD_NODE_STEP = 2

/** Number of non-trailing ad slots currently eligible in a response. */
export function responseAdSlotCount(params: {
  nodeCount: number
  step?: number
}): number {
  const step = Math.max(1, params.step ?? RESPONSE_AD_NODE_STEP)
  return Math.max(0, Math.floor((params.nodeCount - 1) / step))
}

/**
 * Pure helper: after-node indices for up to `adCount` ads given `nodeCount`
 * rendered nodes. The k-th ad goes after node `(k+1)*step - 1`, kept only if
 * a following node exists.
 */
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
    const pos = (k + 1) * step - 1
    positions.push(pos)
  }
  return positions
}
