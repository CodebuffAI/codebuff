import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { Dictionary, mapValues, range, sortBy } from 'lodash'
import { Bet, LimitBet } from 'common/bet'
import { Contract } from 'common/contract'
import { ContractMention } from 'web/components/contract/contract-mention'
import { formatMoney } from 'common/util/format'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { useState } from 'react'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { CalibrationChart } from 'web/components/charts/calibration'
import { SizedContainer } from 'web/components/sized-container'
import { getFullUserByUsername } from 'web/lib/supabase/users'
import Custom404 from '../404'
import { DeletedUser } from '.'
import { User } from 'web/lib/firebase/users'
import { TRADE_TERM, TRADED_TERM } from 'common/envs/constants'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params
  const user = await getFullUserByUsername(username)

  const { yesBuckets, noBuckets, yesBetsBuckets, noBetsBuckets } =
    getCalibrationPoints([])

  const yesPoints = getXY(yesBuckets)
  const noPoints = getXY(noBuckets)

  const score = calculateScore(yesBuckets, noBuckets)

  return {
    props: {
      user,
      yesPoints,
      noPoints,
      score,
      yesBetsBuckets,
      noBetsBuckets,
    },
    revalidate: 60 * 60, // Regenerate after an hour
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function CalibrationPage(props: {
  user: User | null
  yesPoints: { x: number; y: number }[]
  noPoints: { x: number; y: number }[]
  yesBetsBuckets: Record<number, [Contract, Bet][]>
  noBetsBuckets: Record<number, [Contract, Bet][]>
  score: number
}) {
  const { user, yesPoints, noPoints, score } = props

  if (!user) {
    return <Custom404 />
  }

  if (user.userDeleted) {
    return <DeletedUser />
  }

  return (
    <Page
      trackPageView={'user calibration page'}
      trackPageProps={{ username: user.username }}
    >
      <SEO
        title={`${user.name}'s calibration`}
        description="Personal calibration results"
      />
      <Col className="w-full rounded px-4 py-6 sm:px-8 xl:w-[125%]">
        <Col className="max-w-[800px]">
          <Title>{user.name}'s calibration</Title>

          {score !== undefined && (
            <div className="mb-4 text-center text-lg">
              Grade: {getGrade(score)}, Score: {score}
            </div>
          )}

          <div className="bg-canvas-0 relative w-full max-w-[600px] self-center rounded-md p-4 pr-12">
            <div className="absolute bottom-0 right-4 top-0 flex items-center">
              <span className="text-ink-800 text-sm [writing-mode:vertical-rl]">
                Resolution probability
              </span>
            </div>
            <SizedContainer className="aspect-square w-full pb-8 pr-8">
              {(w, h) => (
                <CalibrationChart
                  yesPoints={yesPoints}
                  noPoints={noPoints}
                  width={w}
                  height={h}
                />
              )}
            </SizedContainer>
            <div className="text-ink-800 text-center text-sm">
              Probability after {TRADE_TERM}
            </div>
          </div>

          <div className="prose prose-sm text-ink-600 my-4 max-w-[800px]">
            <b>Interpretation</b>
            <ul>
              <li>
                The green dot at (x%, y%) means when {user.name} {TRADED_TERM}{' '}
                YES at x%, the question resolved YES y% of the time on average.
              </li>

              <li>
                Perfect calibration would result in all green points being above
                the line, all red points below, and a score of zero.
              </li>

              <li>
                The score is the mean squared error for yes and no {TRADE_TERM}s
                times -100.
              </li>

              <li>
                Each point is a bucket of {TRADE_TERM}s weighted by {TRADE_TERM}{' '}
                amount with a maximum range of 10% (sell trades are excluded).
              </li>
            </ul>
          </div>

          <BetsTable
            yesBetsBuckets={props.yesBetsBuckets}
            noBetsBuckets={props.noBetsBuckets}
          />
        </Col>
      </Col>
    </Page>
  )
}

function BetsTable(props: {
  yesBetsBuckets: Record<number, [Contract, Bet][]>
  noBetsBuckets: Record<number, [Contract, Bet][]>
}) {
  const { yesBetsBuckets, noBetsBuckets } = props
  const [betsShown, setBetsShown] = useState<'YES' | 'NO'>('YES')
  const textColor = betsShown === 'YES' ? 'text-teal-600' : 'text-scarlet-600'

  return (
    <div>
      <Row className="justify-center">
        <ChoicesToggleGroup
          choicesMap={{
            'YES trades': 'YES',
            'NO trades': 'NO',
          }}
          currentChoice={betsShown}
          setChoice={(c) => setBetsShown(c as 'YES' | 'NO')}
          color="indigo"
        />
      </Row>
      <div className="text-ink-400 text-center text-xs">
        3 largest {TRADE_TERM}s for each bucket
      </div>

      {Object.entries(betsShown === 'YES' ? yesBetsBuckets : noBetsBuckets).map(
        ([p, contractAndBet]) => (
          <div key={p}>
            <span className={clsx('text-3xl', textColor)}>{p}%</span>
            <ul className="mb-8">
              {contractAndBet.map(([contract, bet]) => (
                <li key={bet.id}>
                  <ContractMention contract={contract} />
                  <span className={clsx('ml-2', textColor)}>
                    {formatMoney(bet.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  )
}

export const points = [1, 3, 5, ...range(10, 100, 10), 95, 97, 99]

const getCalibrationPoints = (betsData: [Contract, LimitBet[]][]) => {
  const yesProbBuckets: Dictionary<number> = {}
  const yesCountBuckets: Dictionary<number> = {}
  const yesBetsBuckets: Record<number, [Contract, Bet][]> = {}

  const noProbBuckets: Dictionary<number> = {}
  const noCountBuckets: Dictionary<number> = {}
  const noBetsBuckets: Record<number, [Contract, Bet][]> = {}

  for (const [contract, bets] of betsData) {
    const { resolution } = contract
    if (resolution !== 'YES' && resolution !== 'NO') continue
    const resolvedYES = resolution === 'YES'

    let currentPosition = 0

    // bets is reversed in place to track user current position
    for (const bet of bets.slice().reverse() as Bet[]) {
      const betSign = bet.outcome === 'YES' ? 1 : -1
      const nextPosition = currentPosition + bet.shares * betSign

      // skip explicit and exclusive implicit sales
      if (
        bet.amount < 0 ||
        (Math.sign(currentPosition) !== betSign &&
          Math.abs(currentPosition) >= Math.abs(bet.shares))
      ) {
        currentPosition = nextPosition // update position before continuing
        continue
      }

      // set bet weight, adjusted for any partial implicit sale
      let w = bet.shares
      if (
        Math.sign(currentPosition) !== betSign &&
        Math.abs(currentPosition) < Math.abs(bet.shares)
      ) {
        w = Math.abs(nextPosition)
      }

      currentPosition = nextPosition // update position

      const rawP = bet.probAfter * 100

      // get probability bucket that's closest to a prespecified point
      const p = points.reduce((prev, curr) =>
        Math.abs(curr - rawP) < Math.abs(prev - rawP) ? curr : prev
      )

      if (bet.outcome === 'YES') {
        yesProbBuckets[p] = (yesProbBuckets[p] ?? 0) + (resolvedYES ? w : 0)
        yesCountBuckets[p] = (yesCountBuckets[p] ?? 0) + w
        yesBetsBuckets[p] = [...(yesBetsBuckets[p] ?? []), [contract, bet]]
      } else {
        noProbBuckets[p] = (noProbBuckets[p] ?? 0) + (resolvedYES ? 0 : w)
        noCountBuckets[p] = (noCountBuckets[p] ?? 0) + w
        noBetsBuckets[p] = [...(noBetsBuckets[p] ?? []), [contract, bet]]
      }
    }
  }

  for (const point of points) {
    if (yesCountBuckets[point]) {
      yesProbBuckets[point] = yesProbBuckets[point] / yesCountBuckets[point]
    }

    if (noCountBuckets[point]) {
      noProbBuckets[point] = 1 - noProbBuckets[point] / noCountBuckets[point]
    }
  }

  // Return the top 3 bets by amount for each probability bucket
  function sortAndLimit(contractAndBets: [Contract, Bet][]) {
    return sortBy(contractAndBets, (cAndB) => -cAndB[1].amount).slice(0, 3)
  }

  return {
    yesBuckets: yesProbBuckets,
    noBuckets: noProbBuckets,
    yesBetsBuckets: mapValues(yesBetsBuckets, sortAndLimit),
    noBetsBuckets: mapValues(noBetsBuckets, sortAndLimit),
  }
}

const getXY = (probBuckets: Dictionary<number>) => {
  const xy = []

  for (const point of points) {
    if (probBuckets[point] !== undefined) {
      xy.push({ x: point / 100, y: probBuckets[point] })
    }
  }

  return xy
}

const calculateScore = (
  yesBuckets: Dictionary<number>,
  noBuckets: Dictionary<number>
) => {
  let score = 0
  let n = 0

  for (const point of points) {
    const prob = point / 100
    const yes = yesBuckets[point]
    const no = noBuckets[point]

    if (yes !== undefined) {
      score += yes < prob ? (prob - yes) ** 2 : 0
      n++
    }

    if (no !== undefined) {
      score += no > prob ? (no - prob) ** 2 : 0
      n++
    }
  }

  const raw = score / n
  return (-100 * Math.round(raw * 1e4)) / 1e4
}

const getGrade = (score: number) => {
  if (score > -0.05) return 'S'
  if (score >= -0.15) return 'A+'
  if (score >= -0.5) return 'A'
  if (score >= -1) return 'A-'
  if (score >= -1.5) return 'B+'
  if (score >= -2.5) return 'B'
  if (score >= -4) return 'B-'
  if (score >= -5.5) return 'C+'
  if (score >= -7) return 'C'
  if (score >= -8.5) return 'C-'
  if (score >= -10) return 'D'
  else return 'F'
}
