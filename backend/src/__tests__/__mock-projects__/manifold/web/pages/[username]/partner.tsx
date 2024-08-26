import clsx from 'clsx'

import { getContractsCreatedProgress } from 'web/lib/supabase/users'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'
import { Col } from 'web/components/layout/col'

import { SEO } from 'web/components/SEO'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import Custom404 from 'web/pages/404'
import Link from 'next/link'
import { useUser, useWebsocketUser } from 'web/hooks/use-user'
import { Avatar } from 'web/components/widgets/avatar'
import { PARTNER_USER_IDS } from 'common/envs/constants'
import { Subtitle } from 'web/components/widgets/subtitle'
import { format } from 'date-fns'
import { FaExternalLinkAlt } from 'react-icons/fa'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import DonutChart from 'web/components/donut-chart'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { useEffect, useState } from 'react'
import { EditablePaymentInfo } from 'web/components/contract/editable-payment-info'
import { useAdmin } from 'web/hooks/use-admin'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { APIResponse } from 'common/api/schema'
import { db } from 'web/lib/supabase/db'
import { getUserForStaticProps } from 'common/supabase/users'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params

  const user = await getUserForStaticProps(db, username)

  return {
    props: removeUndefinedProps({
      user,
      username,
    }),
    revalidate: 60, // Regenerate after a minute
  }
}

export const getStaticPaths = () => {
  return { paths: [], fallback: 'blocking' }
}

export default function UserPartner(props: {
  user: User | null
  username: string
}) {
  if (!props.user) return <Custom404 />
  return <UserPartnerDashboard user={props.user} username={props.username} />
}

function UserPartnerDashboard(props: { user: User; username: string }) {
  const user = useWebsocketUser(props.user.id) ?? props.user
  const userIsPartner = PARTNER_USER_IDS.includes(user.id)

  const { data } = useAPIGetter('get-partner-stats', {
    userId: user.id,
  })

  return (
    <Page
      key={user.id}
      trackPageView={'user page'}
      trackPageProps={{ username: user.username }}
    >
      <SEO
        title={`${user.name} (@${user.username})`}
        description={user.bio ?? ''}
        url={`/${user.username}`}
      />

      <Col className="relative mx-3 mt-1">
        <Row
          className={
            ' mt-2 items-center justify-between md:mt-0 md:inline-flex'
          }
        >
          <Row className={'items-center gap-2'}>
            <span className={'text-primary-700 text-2xl'}>Partner Program</span>
          </Row>
          <Row className="items-end gap-3">
            <div className="flex flex-col items-end">
              <Link
                href={'/' + user.username}
                className={clsx(
                  'hover:text-primary-500  text-ink-600 text-xs '
                )}
              >
                <Avatar
                  avatarUrl={user.avatarUrl}
                  username={user.username}
                  noLink
                  size="xs"
                  className={'mx-auto'}
                />
                Profile
              </Link>
            </div>
          </Row>
        </Row>

        {userIsPartner ? (
          data ? (
            <PartnerDashboard data={data} user={user} />
          ) : (
            <LoadingIndicator />
          )
        ) : (
          <PartnerProgress user={user} />
        )}

        <div className="text-primary-500 hover:text-primary-700 text-md my-4 hover:underline">
          <Link href="/partner-explainer" className="flex items-baseline">
            Learn more about the program here!{' '}
            <FaExternalLinkAlt className="ml-1 h-3 w-3" />
          </Link>
        </div>
      </Col>
    </Page>
  )
}

const PartnerDashboard = (props: {
  data: APIResponse<'get-partner-stats'>
  user: User
}) => {
  const { data, user } = props
  const {
    numUniqueBettors,
    numReferrals,
    numReferralsWhoRetained,
    totalTraderIncome,
    totalReferralIncome,
    dollarsEarned,
  } = data
  const isAdmin = useAdmin()
  const currentUser = useUser()
  const isCurrentUser = currentUser?.id === user.id

  const segments = [
    { label: 'Traders', value: totalTraderIncome, color: '#995cd6' },
    { label: 'Referrals', value: totalReferralIncome, color: '#5cd65c' },
    //{ label: 'Other', value: , color: '#d65c99'},
  ]

  return (
    <Col className=" mt-4 items-start gap-2">
      <div className="text-ink-700">Period Feb 26 - May 26</div>

      {data && (
        <Row className="  gap-6 self-start text-lg">
          <Row className=" gap-1.5">
            <div className="text-ink-700">Traders</div>
            <div className=" font-semibold">{numUniqueBettors}</div>
          </Row>
          <Row className="gap-1.5">
            <div className="text-ink-700 ">Referrals</div>
            <div className="font-semibold">{numReferrals}</div>
          </Row>
          <Row className="gap-1.5">
            <div className="text-ink-700 ">Retained referrals</div>
            <div className="font-semibold">{numReferralsWhoRetained}</div>
          </Row>
          <Link
            href={`/partner-leaderboard`}
            className="hover:text-primary-700 hover:underline"
          >
            <Row className="items-baseline">
              Rank <FaExternalLinkAlt className="ml-1 h-3 w-3" />
            </Row>
          </Link>
        </Row>
      )}
      <DonutChart segments={segments} total={dollarsEarned} />
      {currentUser && (isCurrentUser || isAdmin) && (
        <Row className="text-md flex-wrap items-center gap-2">
          <InfoTooltip
            text={
              "Please enter your PayPal email/link or simply write 'mana'. Only you and admins can see this. Payments to be made quarterly."
            }
          >
            PayPal info:
          </InfoTooltip>
          <EditablePaymentInfo />
        </Row>
      )}
    </Col>
  )
}

const PartnerProgress = (props: { user: User }) => {
  const { user } = props

  const currentDate = new Date()
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - 2)

  const formattedStartDate = format(startDate, 'MMM dd, yyyy')
  const formattedEndDate = format(currentDate, 'MMM dd, yyyy')

  const [marketsCreated, setMarketsCreated] = useState<number | undefined>()
  const [marketsCreatedWithTraders, setMarketsCreatedWithTraders] = useState<
    number | undefined
  >()

  useEffect(() => {
    getContractsCreatedProgress(user.id).then(setMarketsCreated)
    getContractsCreatedProgress(user.id, 20).then(setMarketsCreatedWithTraders)
  }, [user.id])

  return (
    <Col className="gap-4 ">
      <Col className=" mx-0 my-auto mt-4 max-w-[600px] rounded border p-2">
        <Subtitle className="!mt-0  border-b pb-2">
          {user.name}'s progress to partner
        </Subtitle>
        <Row className="justify-between px-1 pb-4 pt-2">
          <div>
            <b>Reach 1250 traders</b>
          </div>
          <div>
            {' '}
            <b>{user.creatorTraders.allTime}</b>/1250
          </div>
        </Row>
        <div className="bg-ink-200 rounded px-4">
          <div className="text-ink-700  my-3 rounded  text-sm">
            <b>60 day performance</b> ({formattedStartDate} - {''}
            {formattedEndDate})
          </div>
          <Row className="justify-between border-b">
            <div>
              <b>Create 20 markets</b>
            </div>
            <div>
              <b>{marketsCreated ?? '0'}</b>/20
            </div>
          </Row>
          <Row className="my-3 justify-between">
            <div>
              <b>10 markets with ≥ 20 traders</b>
            </div>
            <div>
              <b>{marketsCreatedWithTraders ?? 0}</b>
              /10
            </div>
          </Row>
        </div>
      </Col>
      <div>
        Meeting the minimum requirements is just the start of becoming a partner
        and does not guarantee acceptance. We also evaluate user behaviour,
        market quality, consistency and resolutions.
      </div>
      <div>
        There are certain circumstances where we may accept applications outside
        of these criteria. Some instances may include having an established
        audience on other platforms or a history of exceptional forecasting.
      </div>
      <div>
        {' '}
        Please email {''}
        <a
          href="mailto:david@manifold.markets"
          className="text-primary-500 hover:text-primary-700 hover:underline"
        >
          david@manifold.markets
        </a>{' '}
        once you meet the minimum criteria and want to join the program.
      </div>
    </Col>
  )
}
