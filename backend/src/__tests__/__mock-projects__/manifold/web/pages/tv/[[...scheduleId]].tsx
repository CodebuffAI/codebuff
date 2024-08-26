import { getContracts } from 'common/supabase/contracts'
import { TVPage } from 'web/components/tv/tv-page'
import { ScheduleItem, filterSchedule } from 'web/components/tv/tv-schedule'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export async function getStaticProps(props: {
  params: { scheduleId: string[] }
}) {
  const db = await initSupabaseAdmin()
  const scheduleId = props.params.scheduleId?.[0] ?? null

  const { data } = await db.from('tv_schedule').select('*')

  const schedule = filterSchedule(data as ScheduleItem[] | null, scheduleId)

  const contractIds = schedule.map((s) => s.contract_id)
  const contracts = await getContracts(db, contractIds)

  return {
    props: {
      contracts,
      schedule,
      scheduleId,
    },
    revalidate: 60,
  }
}

export default TVPage
