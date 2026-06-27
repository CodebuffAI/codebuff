/**
 * Fractional ordering for queue lanes. Shared by the engine (authoritative
 * reorder) and the renderer (optimistic reorder) so the two never diverge.
 */

/**
 * Position to place an item just after `afterItemId` (null = top of the lane)
 * within `lane` (the lane's other items). A float between neighbors avoids
 * renumbering siblings. `lane` may be unsorted; it is ordered by position here.
 */
export function positionAfter(
  lane: { id: string; position: number }[],
  afterItemId: string | null,
): number {
  const sorted = [...lane].sort((a, b) => a.position - b.position)
  if (!afterItemId) return (sorted[0]?.position ?? 1) - 1
  const idx = sorted.findIndex((i) => i.id === afterItemId)
  const after = sorted[idx]
  const before = sorted[idx + 1]
  if (!after) return (sorted[sorted.length - 1]?.position ?? 0) + 1
  if (before) return (after.position + before.position) / 2
  return after.position + 1
}
