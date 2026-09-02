import { FREEBUFF_DEFAULT_MODEL_MIGRATION_ID } from '../constants/freebuff-models'

/** Wherever a surface keeps its remembered model and the migration stamp:
 *  a settings file, a localStorage key, a set of database rows. */
export interface SavedModelStore {
  readPick(): string | null | undefined
  writePick(model: string): void
  readStamp(): string | null | undefined
  writeStamp(stamp: string): void
}

/**
 * The one-time move of a saved pick off the previous default, shared by every
 * surface. The stamp is written on the FIRST read, whatever is stored, so a
 * pick of the old default made after the flip sticks; only a pick equal to
 * `previous` moves. Returns the pick as the store now holds it.
 */
export function migrateSavedDefaultModel(
  store: SavedModelStore,
  models: { previous: string; current: string },
): string | null | undefined {
  const pick = store.readPick()
  if (store.readStamp() === FREEBUFF_DEFAULT_MODEL_MIGRATION_ID) return pick
  store.writeStamp(FREEBUFF_DEFAULT_MODEL_MIGRATION_ID)
  if (pick !== models.previous) return pick
  store.writePick(models.current)
  return models.current
}
