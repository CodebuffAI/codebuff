import { calculateImportanceScore } from 'shared/importance-score'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'

export const scoreContracts = async () => {
  const db = createSupabaseClient()
  const pg = createSupabaseDirectClient()
  await calculateImportanceScore(db, pg)
}
