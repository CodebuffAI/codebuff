import type { ChatDocumentRef } from './store'

/**
 * Flattens the `attachments` arrays from message rows (passed most-recent
 * first) into a deduped, capped list of document refs. Pure — the DB query
 * lives in store.ts (`listThreadDocumentRefs`) — so the dedup/cap/order logic
 * is unit-testable without a database. Skips rows without an attachments array
 * and entries missing a storageId; dedupes by storageId; stops at `limit`.
 */
export function collectDocumentRefs(
  rows: Array<{ attachments: unknown }>,
  limit: number,
): ChatDocumentRef[] {
  const refs: ChatDocumentRef[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!Array.isArray(row.attachments)) continue
    for (const doc of row.attachments as ChatDocumentRef[]) {
      if (!doc?.storageId || seen.has(doc.storageId)) continue
      seen.add(doc.storageId)
      refs.push(doc)
      if (refs.length >= limit) return refs
    }
  }
  return refs
}
