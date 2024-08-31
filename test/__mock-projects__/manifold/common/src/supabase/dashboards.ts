import { type SupabaseClient } from '@supabase/supabase-js'

export const getDashboardsToDisplayOnContract = async (
  slug: string,
  creatorId: string,
  db: SupabaseClient
) => {
  const { data, error } = await db
    .from('dashboards')
    .select('title, slug')
    .eq('visibility', 'public')
    // one of the scores must be greater than 0 or dashboard is created by the user
    .or(
      `importance_score.gt.0, politics_importance_score.gt.0, ai_importance_score.gt.0, creator_id.eq.${creatorId}'`
    )
    .contains('items', `[{ "type":"question", "slug":"${slug}" }]`)
    .order('importance_score', { ascending: false })
    .order('politics_importance_score', { ascending: false })
    .order('ai_importance_score', { ascending: false })
    .order('created_time')
    .limit(1)

  if (error) console.error(error.message)

  return data ?? []
}
