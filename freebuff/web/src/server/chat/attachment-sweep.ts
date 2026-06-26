import type { ExpiredAttachmentBatchRow } from './store'

/** Injected side effects, so the sweep loop is unit-testable without a DB or
 *  blob store (real implementations wired in the route). */
export interface AttachmentSweepDeps {
  /** Oldest-first expired messages (id + blob storageIds), capped at `limit`. */
  listExpired: (
    cutoff: Date,
    limit: number,
  ) => Promise<ExpiredAttachmentBatchRow[]>
  /** Best-effort, idempotent blob delete. */
  deleteBlobs: (storageIds: string[]) => Promise<void>
  /** Clears the `attachments` refs for the given messages. */
  clearRefs: (messageIds: string[]) => Promise<void>
}

export interface AttachmentSweepResult {
  sweptMessages: number
  deletedBlobs: number
  batches: number
  /** True if the per-call batch cap was hit and more may remain for next run. */
  capped: boolean
}

/**
 * Reclaims expired chat document attachments in bounded batches. For each
 * batch: delete the blobs, THEN clear the refs — so a mid-batch failure leaves
 * the (idempotent) delete to be retried on the next run rather than orphaning
 * blobs. Stops when a short batch is returned (backlog drained) or the batch cap
 * is reached (the next run continues).
 */
export async function runAttachmentSweep(
  deps: AttachmentSweepDeps,
  opts: { cutoff: Date; batchSize: number; maxBatches: number },
): Promise<AttachmentSweepResult> {
  const { cutoff, batchSize, maxBatches } = opts
  let sweptMessages = 0
  let deletedBlobs = 0
  let batches = 0

  while (batches < maxBatches) {
    const rows = await deps.listExpired(cutoff, batchSize)
    if (rows.length === 0) break
    const storageIds = rows.flatMap((r) => r.storageIds)
    if (storageIds.length > 0) await deps.deleteBlobs(storageIds)
    await deps.clearRefs(rows.map((r) => r.id))
    sweptMessages += rows.length
    deletedBlobs += storageIds.length
    batches++
    if (rows.length < batchSize) break
  }

  return { sweptMessages, deletedBlobs, batches, capped: batches >= maxBatches }
}
