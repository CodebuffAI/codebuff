import { NoSEO } from 'web/components/NoSEO'
import { useEffect, useState } from 'react'
import { Row as rowfor, run, tsToMillis } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { HOUR_MS } from 'common/util/time'
import { groupBy, orderBy, uniq } from 'lodash'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { isUserLikelySpammer, User } from 'common/user'
import { UserAvatarAndBadge } from 'web/components/widgets/user-link'
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'
import clsx from 'clsx'
import { useAdmin } from 'web/hooks/use-admin'
import { useIsAuthorized } from 'web/hooks/use-user'
import { formatPercent } from 'common/util/format'
import { Input } from 'web/components/widgets/input'
import { Contract } from 'common/contract'
import { TRADED_TERM } from 'common/envs/constants'

function getMostRecentViewMillis(view: rowfor<'user_contract_views'>) {
  return Math.max(
    view.last_page_view_ts ? tsToMillis(view.last_page_view_ts) : 0,
    view.last_promoted_view_ts ? tsToMillis(view.last_promoted_view_ts) : 0,
    view.last_card_view_ts ? tsToMillis(view.last_card_view_ts) : 0
  )
}

export default function Journeys() {
  const [eventsByUser, setEventsByUser] = useState<
    Record<string, rowfor<'user_events'>[]>
  >({})

  const [marketVisitsByUser, setMarketVisitsByUser] = useState<
    Record<string, rowfor<'user_contract_views'>[]>
  >({})
  const [markets, setMarkets] = useState<
    Pick<Contract, 'question' | 'id' | 'slug'>[]
  >([])

  const [hoursFromNowQ, setHoursFromNowQ] = usePersistentQueryState('h', '5')
  const hoursFromNow = parseInt(hoursFromNowQ ?? '5')
  const [unBannedUsers, setUnBannedUsers] = useState<User[]>([])
  const [bannedUsers, setBannedUsers] = useState<User[]>([])
  const [referrer, setReferrer] = useState<string>()
  const isAuthed = useIsAuthorized()
  const usersThatBet = unBannedUsers.filter(
    (u) => eventsByUser[u.id]?.filter((e) => e.name === 'bet').length > 0
  )
  const userIdsThatBet = unBannedUsers
    .filter(
      (u) => eventsByUser[u.id]?.filter((e) => e.name === 'bet').length > 0
    )
    .map((u) => u.id)
  const likelySpammers = unBannedUsers.filter((u) =>
    isUserLikelySpammer(u, userIdsThatBet.includes(u.id))
  )
  const unlikelySpammers = unBannedUsers.filter(
    (u) => !isUserLikelySpammer(u, userIdsThatBet.includes(u.id))
  )
  const referrers = unBannedUsers.filter((u) => u.referredByUserId)

  const getEvents = async () => {
    const start = Date.now() - hoursFromNow * HOUR_MS
    let usersQ = db
      .from('users')
      .select('id')
      .gt('data->createdTime', start)
      .is('data->fromLove', null)
    if (referrer) {
      usersQ = usersQ
        .not('data->referredByUserId', 'is', null)
        .eq('data->>referredByUserId', referrer)
    }
    const users = await run(usersQ)
    const events = await run(
      db
        .from('user_events')
        .select('*')
        .in(
          'user_id',
          users.data.map((u) => u.id)
        )
    )
    const contractViews = await run(
      db
        .from('user_contract_views')
        .select('*')
        .in(
          'user_id',
          users.data.map((u) => u.id)
        )
    )
    const markets = await run(
      db
        .from('contracts')
        .select('id, question, slug')
        .in('id', uniq(contractViews.data.map((m) => m.contract_id)))
    )
    setMarkets(
      markets.data.map((m) => m as Pick<Contract, 'question' | 'id' | 'slug'>)
    )
    const marketVisitsByUser = groupBy(
      orderBy(
        contractViews.data as rowfor<'user_contract_views'>[],
        (v) => getMostRecentViewMillis(v),
        'asc'
      ),
      'user_id'
    )
    const eventsByUser = groupBy(
      orderBy(events.data as rowfor<'user_events'>[], 'ts', 'asc'),
      'user_id'
    )
    setMarketVisitsByUser(marketVisitsByUser)
    setEventsByUser(eventsByUser)
  }

  const getUsers = async () => {
    const userData = await run(
      db.from('users').select('data').in('id', Object.keys(eventsByUser))
    )
    const users = userData.data.map((d) => d.data as User)
    setBannedUsers(users.filter((u) => u.isBannedFromPosting))
    setUnBannedUsers(users.filter((u) => !u.isBannedFromPosting))
  }

  useEffect(() => {
    getUsers()
  }, [JSON.stringify(Object.keys(eventsByUser))])

  useEffect(() => {
    if (!isAuthed) return
    getEvents()
  }, [hoursFromNow, isAuthed])

  const isAdmin = useAdmin()
  if (!isAdmin) return <></>

  return (
    <Row>
      <NoSEO />
      <div className="text-ink-900 mx-8">
        <div className={'text-primary-700 my-1 text-2xl'}>User Journeys</div>
        <Row className={'items-center gap-2'}>
          Viewing journeys from {unBannedUsers.length} users. You're not seeing{' '}
          {bannedUsers.length} more that are banned. Showing users created:{' '}
          {hoursFromNow}h ago.
          <Button
            color={'indigo-outline'}
            size={'xs'}
            onClick={() => {
              setHoursFromNowQ((hoursFromNow + 1).toString())
            }}
          >
            +1h
          </Button>
        </Row>
        <Row>
          Fraction of (likely real) users that {TRADED_TERM}:{' '}
          {(userIdsThatBet.length / unlikelySpammers.length).toPrecision(2)}. If
          a user is highlighted in yellow, they're likely a spammer. If they're
          highlighted in green, they've {TRADED_TERM}.
        </Row>
        <table>
          <thead>
            <tr className="text-left">
              <th>
                Referrer{' '}
                <Input
                  placeholder={'Filter by referrer user id'}
                  type={'text'}
                  value={referrer}
                  onChange={(e) => setReferrer(e.target.value)}
                  onBlur={getEvents}
                />
              </th>
              <th>Users</th>
              <th>Activation rate</th>
            </tr>
          </thead>
          <tbody>
            {orderBy(
              referrers,
              (r) =>
                unBannedUsers.filter((u) => u.referredByUserId === r.id).length,
              'desc'
            ).map((r) => {
              const referredUsersCount = unBannedUsers.filter(
                (u) => u.referredByUserId === r.id
              ).length
              const usersThatBetCount = usersThatBet.filter(
                (u) => u.referredByUserId === r.id
              ).length
              const fractionThatBet = formatPercent(
                referredUsersCount > 0
                  ? usersThatBetCount / referredUsersCount
                  : 0
              )

              return (
                <tr key={r.id}>
                  <td className="py-2">
                    <UserAvatarAndBadge user={r} />
                  </td>
                  <td>{referredUsersCount}</td>
                  <td>{fractionThatBet}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <Row className={'flex-wrap gap-2 scroll-auto'}>
          {Object.keys(eventsByUser).map((userId) => {
            if (bannedUsers.find((u) => u.id === userId)) return null
            const events = eventsByUser[userId]
            const marketVisits = marketVisitsByUser[userId] ?? []
            const eventGroups: {
              [key: string]: {
                name: string
                link?: string
                ts: string | null
              }[]
            } = {}
            let eventName = ''
            let groupKey = ''
            events.forEach((event, index) => {
              if (event.name !== eventName) groupKey = `${event.name}_${index}`
              if (!eventGroups[groupKey]) eventGroups[groupKey] = []
              eventGroups[groupKey].push(event)
              eventName = event.name
            })
            eventName = ''
            groupKey = ''
            marketVisits.forEach((event, index) => {
              groupKey = `view_${index}`
              if (!eventGroups[groupKey]) eventGroups[groupKey] = []
              eventGroups[groupKey].push({
                ...event,
                name: 'view',
                link: markets.find((m) => m.id === event.contract_id)?.slug,
                ts: new Date(getMostRecentViewMillis(event)).toISOString(),
              })
              eventName = event.contract_id
            })
            const user = unBannedUsers.find((u) => u.id === userId)
            const referrer = referrers.find(
              (u) => u?.id === user?.referredByUserId
            )
            return (
              <Col className={'mt-4 min-w-[15rem]'} key={userId}>
                <Row
                  className={clsx(
                    'rounded-md p-1',
                    user && likelySpammers.find((u) => u.id === user.id)
                      ? 'bg-amber-100'
                      : userIdsThatBet.includes(userId)
                      ? 'bg-green-100'
                      : ''
                  )}
                >
                  <Row className={'items-center gap-1'}>
                    {user ? <UserAvatarAndBadge user={user} /> : userId}
                    {referrer && (
                      <>
                        (Referrer:
                        <UserAvatarAndBadge user={referrer} />)
                      </>
                    )}
                  </Row>
                </Row>
                <ul>
                  <li>{new Date(events[0].ts!).toLocaleString()}</li>
                </ul>
                <Col>
                  {orderBy(
                    Object.values(eventGroups),
                    (group) => group[0].ts,
                    'asc'
                  ).map((group, index) => {
                    console.log(group)
                    const name = group[0].name
                    const times = group.length
                    const timePeriod =
                      new Date(group[times - 1].ts!).valueOf() -
                      new Date(group[0].ts!).valueOf()
                    const duration = Math.round(timePeriod / 1000)

                    return (
                      <li key={index}>
                        {name} {times > 1 ? `${times}x` : ' '}
                        {duration > 1 ? ` (${duration}s)` : ' '}
                        {group[0].link ? (
                          <a
                            className={'text-primary-700'}
                            href={`/market/${group[0].link}`}
                            target="_blank"
                          >
                            {group[0].link}
                          </a>
                        ) : (
                          ''
                        )}
                      </li>
                    )
                  })}
                </Col>
                <ul>
                  <li>
                    {new Date(events[events.length - 1].ts!).toLocaleString()}
                  </li>
                </ul>
              </Col>
            )
          })}
        </Row>
      </div>
    </Row>
  )
}
