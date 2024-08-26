import { Row, run, SupabaseClient } from 'common/supabase/utils'

export const getChartAnnotations = async (
  contractId: string,
  db: SupabaseClient
) => {
  const { data } = await run(
    db
      .from('chart_annotations')
      .select(`*`)
      .eq('contract_id', contractId)
      .order('event_time')
  )
  return data
}
export type ChartAnnotation = Row<'chart_annotations'>
