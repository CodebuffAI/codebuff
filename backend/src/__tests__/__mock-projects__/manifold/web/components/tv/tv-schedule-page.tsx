import dayjs from 'dayjs'
import { useState } from 'react'
import Link from 'next/link'
import { partition } from 'lodash'

import { Contract } from 'common/contract'
import { SEO } from 'web/components/SEO'
import { Button } from 'web/components/buttons/button'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { Subtitle } from 'web/components/widgets/subtitle'
import { Avatar } from 'web/components/widgets/avatar'
import { ScheduleTVModal } from './schedule-tv-modal'
import { ScheduleItem } from './tv-schedule'
import { useUser } from 'web/hooks/use-user'
import { BsCircleFill } from 'react-icons/bs'
import { capitalize } from 'lodash'
import { TRADE_TERM } from 'common/envs/constants'

export function TVSchedulePage(props: {
  schedule: ScheduleItem[]
  contracts: Record<string, Contract>
}) {
  const { schedule, contracts } = props
  const [featured, userCreated] = partition(schedule, (s) => s.is_featured)

  const [showSettings, setShowSettings] = useState(false)
  const user = useUser()

  return (
    <Page trackPageView="tv page" className="p-4">
      <SEO
        title="Manifold TV"
        description={`${capitalize(
          TRADE_TERM
        )} on live video streams with Manifold TV`}
      />
      <Title>Manifold TV</Title>

      <div>
        {capitalize(TRADE_TERM)} on live video streams with your friends!
      </div>

      {featured.length > 0 && (
        <>
          <Subtitle>Featured events</Subtitle>

          {featured
            .map((s) => [s, contracts[s.contract_id]] as const)
            .map(([s, c]) => (
              <ScheduleRow key={s.id} stream={s} contract={c} />
            ))}
        </>
      )}

      <Subtitle>User-created events</Subtitle>
      {userCreated
        .map((s) => [s, contracts[s.contract_id]] as const)
        .map(([s, c]) => (
          <ScheduleRow key={s.id} stream={s} contract={c} />
        ))}
      {userCreated.length === 0 && (
        <div className="italic">No events scheduled</div>
      )}

      {user && (
        <Row className="mt-8">
          <Button color="indigo-outline" onClick={() => setShowSettings(true)}>
            Schedule event
          </Button>
          <ScheduleTVModal
            open={showSettings}
            setOpen={() => setShowSettings(false)}
          />
        </Row>
      )}
    </Page>
  )
}

function ScheduleRow(props: { stream: ScheduleItem; contract: Contract }) {
  const { stream, contract } = props
  const happeningNow =
    dayjs().isAfter(stream.start_time) && dayjs().isBefore(stream.end_time)

  return (
    <div className="mb-4 flex flex-col items-start gap-1">
      <Link
        href={`/tv/${stream.id}`}
        key={stream.id}
        className="flex items-center gap-2 hover:underline"
      >
        <Avatar
          size="2xs"
          avatarUrl={contract?.creatorAvatarUrl}
          username={contract?.creatorUsername}
          noLink
        />
        <span className="font-semibold">{stream.title}</span>
        {happeningNow && <BsCircleFill className=" text-red-500" />}
      </Link>
      <span>{formatTimeRange(stream.start_time, stream.end_time)}</span>
    </div>
  )
}

const formatTimeRange = (start: string, end: string) => {
  const s = dayjs(start)
  const e = dayjs(end)

  const endDate = e.isSame(s, 'day') ? '' : `${e.format('M/D')} `

  return (
    <Row>
      {s.format('M/D H:mm')} - {endDate}
      {e.format('H:mm')}
    </Row>
  )
}
