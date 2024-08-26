import { useState } from 'react'
import { axisBottom, axisRight } from 'd3-axis'
import { scaleLinear } from 'd3-scale'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { SVGChart, formatPct } from 'web/components/charts/helpers'
import { formatLargeNumber } from 'common/util/format'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Linkify } from 'web/components/widgets/linkify'
import { SizedContainer } from 'web/components/sized-container'
import { TrustPanel } from 'web/components/trust-panel'
import ChevronDownIcon from '@heroicons/react/solid/ChevronDownIcon'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { Contract } from 'common/contract'
import { Subtitle } from 'web/components/widgets/subtitle'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { getContract } from 'common/supabase/contracts'

const TRADER_THRESHOLD = 15
const SAMPLING_P = 0.02

export const getStaticProps = async () => {
  const db = await initSupabaseAdmin()

  try {
    const result = await db
      .from('platform_calibration')
      .select('*')
      .order('created_time', { ascending: false })
      .limit(1)

    const { points, score, n } = result.data?.[0]?.data as any
    const trumpMarket = await getContract(db, 'AiEh38dIYVV5tOs1RmN3')
    const gazaMarket = await getContract(db, 'KmWz1wvC8AmNX3a1iiUF')
    const sbfMarket = await getContract(db, 'dRdXZtj8UXiXxkoF2rXE')

    return {
      props: {
        points,
        score,
        n,
        trumpMarket,
        gazaMarket,
        sbfMarket,
      },
      revalidate: 60 * 60, // Regenerate after an hour
    }
  } catch (err) {
    console.error(err)
    return {
      props: {
        points: [],
        score: 0,
        n: 0,
        trumpMarket: null,
        gazaMarket: null,
        sbfMarket: null,
      },
      revalidate: 60,
    }
  }
}

export default function CalibrationPage(props: {
  points: { x: number; y: number }[]
  score: number
  n: number
  trumpMarket: Contract | null
  gazaMarket: Contract | null
  sbfMarket: Contract | null
}) {
  const { points, score, n, trumpMarket, gazaMarket, sbfMarket } = props
  const [isCollapsed, setIsCollapsed] = useState(true)

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed)
  }
  if (!trumpMarket || !gazaMarket || !sbfMarket) {
    return <div>Contracts not found</div>
  }

  return (
    <Page trackPageView={'platform calibration page'}>
      <SEO
        title={`Platform calibration`}
        description="Manifold's overall track record"
      />
      <Col className=" w-full rounded px-4 py-6 sm:px-8 xl:w-[125%]">
        <Col className="w-full max-w-[800px]">
          <Title>Track Record and Accuracy</Title>

          <TrustPanel />

          <Subtitle>Overall calibration</Subtitle>
          <div className="text-ink-600 mb-2">
            This chart show whether events happened as often as we predicted. We
            want to blue dots to be as close to the diagonal line as possible!{' '}
          </div>
          <div className="text-ink-600">
            A dot with a question probability of 70% means we have a group of
            markets that were predicted to have a 70% chance of occurring. If
            our predictions are perfectly calibrated, then 70% of those markets
            should have resolved yes and it should appear on the y-axis at 70%.
          </div>

          <Col className="mt-4 w-full">
            <div className="bg-canvas-0 relative w-full  rounded-md p-4 pr-12">
              <div className="absolute bottom-0 right-4 top-0 flex items-center">
                <span className="text-ink-800 text-sm [writing-mode:vertical-rl]">
                  Resolved Yes
                </span>
              </div>

              <SizedContainer className="aspect-video w-full pb-8 pr-8">
                {(w, h) => (
                  <CalibrationChart points={points} width={w} height={h} />
                )}
              </SizedContainer>
              <div className="text-ink-800 text-center text-sm">
                Question probability
              </div>
            </div>
          </Col>

          <div className="prose prose-md text-ink-600 max-w-[800px]">
            <ul>
              <li>
                <b>Methodology and Brier score</b>
                <br />
                <div
                  className=" flex cursor-pointer items-center"
                  onClick={toggleCollapse}
                >
                  TL;DR Our data shows our markets are very accurate!&nbsp;
                  <div className="text-primary-700 hover:underline">
                    Learn more
                  </div>
                  <ChevronDownIcon
                    className={` h-6 w-6  ${
                      isCollapsed ? '' : 'rotate-180 transform'
                    }`}
                  />
                </div>

                {!isCollapsed && (
                  <div>
                    {
                      <ul className=" list-decimal pl-5">
                        <li>
                          Every hour we sample {''}
                          {formatPct(SAMPLING_P)} of all past trades on resolved
                          binary questions with {TRADER_THRESHOLD} or more
                          traders. Current sample size: {formatLargeNumber(n)}{' '}
                          trades.
                        </li>
                        <li>
                          For each sampled trade, we find the average
                          probability between the start and end.
                        </li>
                        <li>
                          We group trades with similar probabilities together.
                        </li>
                        <li>
                          Then, we check for trades that said there was eg. a
                          60% chance, and how often those markets resolve yes.
                          In this case we would expect 60% of them to have
                          resolved yes for perfect calibration!
                        </li>
                        <li>
                          We can repeat this at each probability interval to
                          plot a graph showing how the probability of our trades
                          compare to how often is actually happens!
                        </li>
                        <li>
                          Our {''}
                          <InfoTooltip text="Mean squared error of forecasted probability compared to the true outcome.">
                            <b>Brier score</b>
                          </InfoTooltip>
                          : {Math.round(score * 1e5) / 1e5}
                          <br />
                          This number between 0 and 1 that tells us how good our
                          predictions are. Closer to 0 is better. A score
                          between 0.1 and 0.2 is very good!
                        </li>
                        <li>
                          <b>Flaws</b>: This methodology uses trade-weighted
                          rather than time-weighted calibration. Market accuracy
                          may be better than what is reflected here, as large
                          miscalibrated trades are usually corrected
                          immediately!
                        </li>
                      </ul>
                    }
                  </div>
                )}
              </li>
            </ul>
          </div>

          <Subtitle>Case studies</Subtitle>

          <div className="text-ink-600 py-2 pb-4">
            <div className="pb-8">
              <div className={'text-ink-600 text-xl'}>
                Predicting Trump's arrest
              </div>
              <div className="py-1">
                <FeedContractCard
                  contract={trumpMarket}
                  showGraph={true}
                ></FeedContractCard>
              </div>
              <div className="py-1">
                On March 18th Trump posted on Truth Social that he believes he
                was about to be arrested, this caused our market to spike to
                88%. However, since December our market had already been
                hovering around 40% on average before anyone else was even
                discussing it as a true possibility of happening!
              </div>
            </div>
            <div className="pb-8">
              <div className={'text-ink-600  text-xl'}>
                Al-Ahli Arab hospital explosion
              </div>
              <div className="py-1">
                <FeedContractCard
                  contract={gazaMarket}
                  showGraph={true}
                ></FeedContractCard>
                <div className="py-1">
                  Just 3 hours after the initial local reports of the explosion,
                  we had this market made. Within 1 hour of creation it had
                  already been pushed to down 6%, before eventually settling
                  between 6-20% over the next few hours as more news came to
                  light.
                  <br />
                  <br />
                  Meanwhile, major news outlets still presented conflicting
                  headlines, which eventually led to the {''}
                  <a
                    className="text-primary-700 hover:underline"
                    target="_blank"
                    href="https://www.theguardian.com/world/2023/oct/19/israel-accuses-bbc-of-modern-blood-libel-over-reporting-of-hospital-strike"
                  >
                    BBC conceding that a reporter had been wrong to speculate in
                    his analysis.
                  </a>
                </div>
              </div>
            </div>

            <div className="pb-8">
              <div className={'text-ink-600  text-xl'}>
                Predicting SBF fraud
              </div>
              <div className="py-1">
                <FeedContractCard
                  contract={sbfMarket}
                  showGraph={true}
                ></FeedContractCard>
              </div>
              <div className="py-1">
                Manifold had a market stable between 5-10% that SBF would be
                convicted of a felony 1-month before there was any news about
                it. It then immediately reacted correctly to rumors before any
                official statements were made.
              </div>
            </div>

            <div className="">
              <div className={'text-ink-600  text-xl'}>
                How we performed on the 2022 US midterms
              </div>
              <div className="pb-1">
                Manifold{' '}
                <a
                  className="text-primary-700 hover:underline"
                  target="_blank"
                  href="https://firstsigma.substack.com/p/midterm-elections-forecast-comparison-analysis"
                >
                  outperformed real money prediction markets and was almost as
                  accurate as FiveThiryEight
                </a>{' '}
                when forecasting the 2022 US midterm elections.
              </div>
            </div>
          </div>

          <WasabiCharts />
        </Col>
      </Col>
    </Page>
  )
}

type Point = { x: number; y: number }

export function CalibrationChart(props: {
  points: Point[]
  width: number
  height: number
}) {
  const { points, width, height } = props

  const xScale = scaleLinear().domain([0, 1]).range([0, width])
  const yScale = scaleLinear().domain([0, 1]).range([height, 0])

  const tickVals = points.map((p) => p.x)

  const format = (d: number) =>
    (d <= 0.9 || d === 0.99) && (d >= 0.1 || d === 0.01) ? formatPct(d) : ''

  const xAxis = axisBottom<number>(xScale)
    .tickFormat(format)
    .tickValues(tickVals)

  const yAxis = axisRight<number>(yScale)
    .tickFormat(format)
    .tickValues(tickVals)

  const px = (p: Point) => xScale(p.x)
  const py = (p: Point) => yScale(p.y)

  const [point, setPoint] = useState<Point | null>(null)

  return (
    <SVGChart
      w={width}
      h={height}
      xAxis={xAxis}
      yAxis={yAxis}
      ttParams={point ? { x: px(point), y: py(point), point } : undefined}
      Tooltip={({ point }) => {
        return (
          <div>
            ({formatPct(point.x)}, {formatPct(point.y)})
          </div>
        )
      }}
    >
      {/* points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={px(p)}
          cy={py(p)}
          r={6}
          className="fill-primary-700"
          onMouseEnter={() => setPoint(p)}
          onMouseLeave={() => setPoint(null)}
          style={{ cursor: 'pointer' }}
        />
      ))}

      {/* line x = y */}
      <line
        x1={xScale(0)}
        y1={yScale(0)}
        x2={xScale(1)}
        y2={yScale(1)}
        className="stroke-primary-800"
        strokeWidth={1}
        strokeDasharray="4 8"
      />
    </SVGChart>
  )
}

export function WasabiCharts() {
  return (
    <>
      <div className="text-ink-600 mt-8">
        See more {''}
        <a
          className="text-primary-700 hover:underline"
          target="_blank"
          href="https://wasabipesto.com/manifold/markets/"
        >
          charts
        </a>
        {''} courtesy of <Linkify text="@wasabipesto" /> from our data in 2022.
      </div>
    </>
  )
}
