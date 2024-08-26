import { mapKeys, uniqBy } from 'lodash'
import { Contract } from 'common/contract'
import { SEO } from 'web/components/SEO'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { useContracts } from 'web/hooks/use-contract'
import { ScheduleItem, getActiveStream, useTVSchedule } from './tv-schedule'
import { TVDisplay } from './tv-display'
import { TVSchedulePage } from './tv-schedule-page'
import { db } from 'web/lib/supabase/db'
import { useEffect, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { capitalize } from 'lodash'
import { TRADE_TERM } from 'common/envs/constants'

export function TVPage(props: {
  schedule: ScheduleItem[]
  contracts: Contract[]
  scheduleId: string | null
}) {
  const schedule = useTVSchedule(props.schedule, props.scheduleId)

  const contractsList = props.contracts.concat(
    useContracts(
      schedule.map((s) => s.contract_id),
      undefined
    )
  )
  const contracts = mapKeys(contractsList, 'id')

  const stream = getActiveStream(schedule, props.scheduleId)
  const contract = contracts[stream?.contract_id ?? '']
  const watchers = usePresences(stream?.id)

  if (!contract && props.scheduleId && props.scheduleId !== 'schedule') {
    return (
      <Page trackPageView="tv page">
        <SEO
          title="Manifold TV"
          description={`${capitalize(
            TRADE_TERM
          )} on live video streams with Manifold TV`}
        />
        <Title>Manifold TV</Title>
        <div className="italic">Cannot find scheduled event</div>
      </Page>
    )
  }

  if (!contract || props.scheduleId === 'schedule')
    return <TVSchedulePage schedule={schedule} contracts={contracts} />

  return <TVDisplay contract={contract} stream={stream} watchers={watchers} />
}

export type Presence = {
  id: string
  name: string
  username: string
  avatarUrl: string
  onlineAt: number
}

const usePresences = (streamId?: number) => {
  const [users, setUsers] = useState<Presence[]>([])

  const me = useUser()

  useEffect(() => {
    if (!streamId) return

    const chan = db.channel(`tv:${streamId}`)
    chan
      .on('presence', { event: 'sync' }, () => {
        setUsers(
          uniqBy(
            Object.values(chan.presenceState<Presence>())
              .map((s) => s[0])
              .sort((a, b) => a.onlineAt - b.onlineAt),
            'id'
          )
        )
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        setUsers((users) => uniqBy([...(newPresences as any), ...users], 'id'))
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        setUsers((users) =>
          users.filter((u) => !leftPresences.some((left) => left.id == u.id))
        )
      })

    if (me) {
      chan.subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return
        chan.track({
          id: me.id,
          name: me.name,
          username: me.username,
          avatarUrl: me.avatarUrl,
          onlineAt: Date.now(),
        })
      })
    } else {
      // TODO: maybe support signed out users?
      chan.subscribe()
    }

    return () => {
      chan.untrack()
    }
  }, [streamId, me])

  return users
}
