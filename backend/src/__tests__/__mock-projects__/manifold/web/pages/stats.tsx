import { DailyChart } from 'web/components/charts/stats'
import { Col } from 'web/components/layout/col'
import { Spacer } from 'web/components/layout/spacer'
import { Tabs } from 'web/components/layout/tabs'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { getStats } from 'web/lib/supabase/stats'
import { orderBy, sum, sumBy } from 'lodash'
import { formatLargeNumber, formatMoney } from 'common/util/format'
import { formatWithCommas } from 'common/util/format'
import { SEO } from 'web/components/SEO'
import { useAdmin } from 'web/hooks/use-admin'
import Link from 'next/link'
import { linkClass } from 'web/components/widgets/site-link'
import { api } from '../lib/api/api'
import { Column, Row as rowfor } from 'common/supabase/utils'
import { BonusSummary } from 'web/components/stats/bonus-summary'
import { ManaSupplySummary } from 'web/components/stats/mana-summary'
import { Row } from 'web/components/layout/row'
import { average } from 'common/util/math'
import { useCallback, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { TRADE_TERM, TRADED_TERM } from 'common/envs/constants'
import { capitalize } from 'lodash'

export const getStaticProps = async () => {
  try {
    const stats = await getStats()
    const manaSupplyOverTime = await api('get-mana-summary-stats', {
      limitDays: 100,
    })
    const fromBankSummary = await api('get-txn-summary-stats', {
      ignoreCategories: ['RECLAIM_MANA', 'AIR_DROP', 'EXTRA_PURCHASED_MANA'],
      fromType: 'BANK',
      limitDays: 100,
    })
    const toBankSummary = await api('get-txn-summary-stats', {
      toType: 'BANK',
      ignoreCategories: ['RECLAIM_MANA'],
      limitDays: 100,
    })
    return {
      props: { stats, fromBankSummary, toBankSummary, manaSupplyOverTime },
      revalidate: 60 * 60, // One hour
    }
  } catch (err) {
    console.error(err)
    return { props: { stats: null }, revalidate: 60 }
  }
}

export default function Analytics(props: {
  stats: rowfor<'daily_stats'>[]
  manaSupplyOverTime: rowfor<'mana_supply_stats'>[]
  fromBankSummary: rowfor<'txn_summary_stats'>[]
  toBankSummary: rowfor<'txn_summary_stats'>[]
}) {
  const { stats, manaSupplyOverTime, fromBankSummary, toBankSummary } = props

  if (!stats) {
    return null
  }
  return (
    <Page trackPageView={'site stats page'}>
      <SEO
        title="Stats"
        description="See site-wide usage statistics."
        url="/stats"
      />
      <CustomAnalytics
        stats={stats}
        manaSupplyOverTime={manaSupplyOverTime}
        fromBankSummary={fromBankSummary}
        toBankSummary={toBankSummary}
      />
    </Page>
  )
}

export function CustomAnalytics(props: {
  stats: rowfor<'daily_stats'>[]
  manaSupplyOverTime: rowfor<'mana_supply_stats'>[]
  fromBankSummary: rowfor<'txn_summary_stats'>[]
  toBankSummary: rowfor<'txn_summary_stats'>[]
}) {
  const { manaSupplyOverTime, fromBankSummary, toBankSummary } = props
  const [stats, setStats] = useState(props.stats)

  const dataFor = useCallback(dataForStats(stats), [stats])

  const fracDaysActiveD1ToD3 = dataFor('active_d1_to_d3')
  const fracDaysActiveD1ToD3Avg7d = rollingAvg(
    dataFor('active_d1_to_d3'),
    7
  ).slice(7)

  const currentSupply = manaSupplyOverTime[manaSupplyOverTime.length - 1]
  const yesterdaySupply = manaSupplyOverTime[manaSupplyOverTime.length - 2]
  const differenceInSupplySinceYesterday =
    currentSupply.total_value - yesterdaySupply.total_value
  const latestRecordingTime = orderBy(fromBankSummary, 'start_time', 'desc')[0]
    .start_time
  const fromBankSum = sumBy(
    fromBankSummary.filter((txn) => txn.start_time === latestRecordingTime),
    'total_amount'
  )
  const toBankSum = sumBy(
    toBankSummary.filter((txn) => txn.start_time === latestRecordingTime),
    'total_amount'
  )
  const netBankTransactions = fromBankSum - toBankSum
  const unaccountedDifference =
    differenceInSupplySinceYesterday - netBankTransactions

  const dailyDividedByWeekly = stats
    .filter((row) => row.dau && row.wau)
    .map((row) => ({ x: row.start_date, y: row.dau! / row.wau! }))
  const dailyDividedByMonthly = stats
    .filter((row) => row.dau && row.mau)
    .map((row) => ({ x: row.start_date, y: row.dau! / row.mau! }))
  const weeklyDividedByMonthly = stats
    .filter((row) => row.wau && row.mau)
    .map((row) => ({ x: row.start_date, y: row.wau! / row.mau! }))

  const current = stats[stats.length - 1]
  const avgDAUlastWeek = average(
    stats
      .slice(-7)
      .map((row) => row.dau)
      .filter((val): val is number => val != null)
  )
  const last30dSales = sum(stats.slice(-30).map((row) => row.sales || 0))

  const isAdmin = useAdmin()

  return (
    <Col className="px-4 sm:pl-6 sm:pr-16">
      <div className="flex items-start justify-between">
        <Title>Active users</Title>
        <Button onClick={() => getStats().then(setStats)}>Reload All</Button>
      </div>
      <p className="text-ink-500">
        An active user is a user who has traded in, commented on, or created a
        question.
      </p>
      <div className="text-ink-500 mt-2">
        <b>{formatLargeNumber(current.dau ?? 0)} DAUs</b> yesterday;{' '}
        {formatLargeNumber(avgDAUlastWeek)} avg DAUs last week
      </div>
      <Spacer h={4} />
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: <DailyChart values={dataFor('dau')} />,
          },
          {
            title: 'Daily (7d avg)',
            content: (
              <DailyChart values={rollingAvg(dataFor('dau'), 7).map(round)} />
            ),
          },
          {
            title: 'Weekly',
            content: <DailyChart values={dataFor('wau')} />,
          },
          {
            title: 'Monthly',
            content: <DailyChart values={dataFor('mau')} />,
          },
        ]}
      />
      <Spacer h={8} />
      <Title>Engaged users</Title>
      <p className="text-ink-500">
        An engaged user is a user who has traded in, commented on, or created a
        question on at least 2 out of 7 days in each of the past 3 weeks.
      </p>
      <div className="text-ink-500 mt-2">
        <b>{formatLargeNumber(current.engaged_users ?? 0)} </b> engaged users
      </div>
      <Spacer h={4} />
      <DailyChart values={dataFor('engaged_users')} />
      <Spacer h={8} />
      <Title>Mana supply</Title>
      <Col className="mb-6 max-w-sm gap-2">
        Supply Today
        <Row className="justify-between">
          <div className="text-ink-700">Balances</div>
          <div className="text-ink-700 font-semibold">
            {formatMoney(currentSupply.balance)}
          </div>
        </Row>
        <Row className="justify-between">
          <div className="text-ink-700">Prize point balances</div>
          <div className="text-ink-700 font-semibold">
            ₽{formatWithCommas(currentSupply.spice_balance)}
          </div>
        </Row>
        <Row className="justify-between">
          <div className="text-ink-700">Investment</div>
          <div className="text-ink-700 font-semibold">
            {formatMoney(currentSupply.investment_value)}
          </div>
        </Row>
        {/* <Row className="justify-between">
          <div className="text-ink-700">Loans</div>
          <div className="text-ink-700 font-semibold">
            {formatMoney(manaSupply.loanTotal)}
          </div>
        </Row> */}
        <Row className="justify-between">
          <div className="text-ink-700">AMM liquidity</div>
          <div className="text-ink-700 font-semibold">
            {formatMoney(currentSupply.amm_liquidity)}
          </div>
        </Row>
        <Row className="mt-6 justify-between">
          <div className="text-ink-700">Unaccounted for since yesterday</div>
          <div className="text-ink-700 font-semibold">
            {formatMoney(unaccountedDifference)}
          </div>
        </Row>
        <Row className="mt-2 justify-between">
          <div className="text-ink-700">Total</div>
          <div className="text-ink-700 font-semibold">
            {formatMoney(currentSupply.total_value)}
          </div>
        </Row>
      </Col>
      <Title>Mana supply over time</Title>
      <ManaSupplySummary manaSupplyStats={manaSupplyOverTime} />
      <Spacer h={8} />
      <Title>Transactions from Manifold</Title>
      <BonusSummary txnSummaryStats={fromBankSummary} />
      <Spacer h={8} />
      <Title>Transactions to Manifold</Title>
      <span className={'text-ink-700'}>(Ignores mana purchases)</span>
      <BonusSummary txnSummaryStats={toBankSummary} />
      <Spacer h={8} />
      <Title>Mana sales</Title>
      <p className="text-ink-500">
        <b>${formatWithCommas(last30dSales)}</b> of mana sold in the last 30d
      </p>
      <Spacer h={4} />
      <Tabs
        className="mb-4"
        defaultIndex={0}
        tabs={[
          {
            title: 'Daily',
            content: <DailyChart values={dataFor('sales')} />,
          },
          {
            title: 'Daily (7d avg)',
            content: (
              <DailyChart values={rollingAvg(dataFor('sales'), 7).map(round)} />
            ),
          },
          {
            title: 'Monthly',
            content: <DailyChart values={rollingSum(dataFor('sales'), 30)} />,
          },
        ]}
      />
      <Spacer h={8} />
      <Title>Retention</Title>
      <p className="text-ink-500">
        What fraction of active users are still active after the given time
        period?
      </p>
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'D1',
            content: <DailyChart values={dataFor('d1')} pct />,
          },
          {
            title: 'D1 (7d avg)',
            content: <DailyChart values={rollingAvg(dataFor('d1'), 7)} pct />,
          },
          {
            title: 'W1',
            content: <DailyChart values={dataFor('w1')} pct />,
          },
          {
            title: 'M1',
            content: <DailyChart values={dataFor('m1')} pct />,
          },
        ]}
      />
      <Spacer h={8} />
      <Title>New user retention</Title>
      <p className="text-ink-500">
        What fraction of new users are still active after the given time period?
      </p>
      <Spacer h={4} />
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'ND1',
            content: <DailyChart values={dataFor('nd1')} pct />,
          },
          {
            title: 'ND1 (7d avg)',
            content: (
              <DailyChart values={rollingAvg(dataFor('nd1'), 7).slice(7)} pct />
            ),
          },
          {
            title: 'Active days D1-D3',
            content: <DailyChart values={fracDaysActiveD1ToD3} pct />,
          },
          {
            title: 'Active days D1-D3 (7d avg)',
            content: <DailyChart values={fracDaysActiveD1ToD3Avg7d} pct />,
          },
          {
            title: 'NW1',
            content: <DailyChart values={dataFor('nw1').slice(14)} pct />,
          },
        ]}
      />
      <Spacer h={8} />
      <Title>Daily activity</Title>
      <Tabs
        className="mb-4"
        defaultIndex={0}
        tabs={[
          {
            title: `${capitalize(TRADE_TERM)}s`,
            content: <DailyChart values={dataFor('bet_count')} />,
          },
          {
            title: 'Questions created',
            content: <DailyChart values={dataFor('contract_count')} />,
          },
          {
            title: 'Comments',
            content: <DailyChart values={dataFor('comment_count')} />,
          },
          {
            title: 'Signups',
            content: <DailyChart values={dataFor('signups_real')} />,
          },
        ]}
      />
      <Spacer h={8} />
      <Title>Activation rate</Title>
      <p className="text-ink-500">
        Out of all new users, how many placed at least one {TRADE_TERM}?
      </p>
      <Spacer h={4} />
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: <DailyChart values={dataFor('activation')} pct />,
          },
          {
            title: 'Daily (7d avg)',
            content: (
              <DailyChart
                values={rollingAvg(dataFor('activation'), 7).slice(7)}
                pct
              />
            ),
          },
        ]}
      />
      <Spacer h={8} />
      <Title>D1 average new user {TRADE_TERM}s</Title>
      <p className="text-ink-500">
        On average for new users, how many {TRADE_TERM}s did they place in the
        first 24 hours?
      </p>
      {isAdmin && (
        <Link className={linkClass} href={'/admin/journeys'}>
          Check out the new user journerys page to see what they did.
        </Link>
      )}
      <Spacer h={4} />
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: <DailyChart values={dataFor('d1_bet_average')} />,
          },
          {
            title: 'Daily (3d average)',
            content: (
              <DailyChart values={dataFor('d1_bet_3_day_average').slice(1)} />
            ),
          },
        ]}
      />
      <Spacer h={8} />
      <Title>Ratio of Active Users</Title>
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily / Weekly',
            content: <DailyChart values={dailyDividedByWeekly} pct />,
          },
          {
            title: 'Daily / Monthly',
            content: <DailyChart values={dailyDividedByMonthly} pct />,
          },
          {
            title: 'Weekly / Monthly',
            content: <DailyChart values={weeklyDividedByMonthly} pct />,
          },
        ]}
      />
      <Spacer h={8} />
      <Title>Total mana {TRADED_TERM}</Title>
      <p className="text-ink-500">
        Sum of {TRADE_TERM} amounts. (Divided by 100 to be more readable.)
      </p>
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: <DailyChart values={dataFor('bet_amount')} />,
          },
          {
            title: 'Weekly',
            content: (
              <DailyChart values={rollingSum(dataFor('bet_amount'), 7)} />
            ),
          },
          {
            title: 'Monthly',
            content: (
              <DailyChart values={rollingSum(dataFor('bet_amount'), 30)} />
            ),
          },
        ]}
      />
      <Spacer h={8} />
      <Title>Home feed conversion rate</Title>
      <p className="text-ink-500">Interactions/views</p>
      <Spacer h={4} />
      <DailyChart values={dataFor('feed_conversion')} pct />,
      <Spacer h={8} />
    </Col>
  )
}

const dataForStats =
  (stats: rowfor<'daily_stats'>[]) =>
  <S extends Column<'daily_stats'>>(key: S) =>
    stats
      .map((row) => ({ x: row.start_date, y: row[key]! }))
      .filter((row) => row.y != null)

const rollingAvg = (arr: { x: string; y: number }[], period: number) =>
  arr.map(({ x }, i) => {
    const start = Math.max(0, i - period + 1)
    const end = i + 1
    const values = arr.slice(start, end).map((d) => d.y ?? 0)
    return { x, y: values.length ? average(values) : 0 }
  })

const rollingSum = (arr: { x: string; y: number }[], period: number) =>
  arr.map(({ x }, i) => {
    const start = Math.max(0, i - period + 1)
    const end = i + 1
    const values = arr.slice(start, end).map((d) => d.y ?? 0)
    const total = sum(values)
    // scale to make up for holes or missing data at the start
    const adjusted =
      values.length == period ? total : (total * period) / values.length
    return { x, y: adjusted }
  })

const round = (point: { x: string; y: number }) => ({
  x: point.x,
  y: Math.round(point.y),
})
