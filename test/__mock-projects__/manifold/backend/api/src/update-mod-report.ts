import { ModReport } from 'common/mod-report'
import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseClient } from 'shared/supabase/init'
import { removeUndefinedProps } from 'common/util/object'

export const updateModReport: APIHandler<'update-mod-report'> = async (
  props
) => {
  const { reportId, updates } = props
  const db = createSupabaseClient()

  const updateData = removeUndefinedProps(updates)

  const { data, error } = await db
    .from('mod_reports')
    .update(updateData)
    .eq('report_id', reportId)
    .select()

  if (error) {
    console.error('Error updating report:', error)
    throw new APIError(500, 'Error updating report', { error })
  }
  if (!data || data.length === 0) {
    console.error('Report not found for ID:', reportId)
    throw new APIError(404, 'Report not found')
  }

  return { status: 'success', report: data[0] as ModReport }
}
