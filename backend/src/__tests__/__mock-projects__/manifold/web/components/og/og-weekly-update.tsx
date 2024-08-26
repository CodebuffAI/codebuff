/* eslint-disable jsx-a11y/alt-text */
import { WeeklyPortfolioUpdateOGCardProps } from 'common/weekly-portfolio-update'
import { ProfitLossGraph } from 'web/components/og/graph'
import { Point } from 'common/edge/og'

// Notes for working with this:
// - Some css elements are missing or broken (e.g. 'gap' and 'text-ellipsis' and 'line-clamp')
// - I also can't make things overflow hidden in only one direction
// - Every element should have `flex` set
export function OgWeeklyUpdate(props: WeeklyPortfolioUpdateOGCardProps) {
  const {
    creatorName,
    creatorAvatarUrl,
    creatorUsername,
    weeklyProfit,
    points,
  } = props
  const data = JSON.parse(points) as Point[]
  const date =
    new Date(data[0].x).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }) +
    ' - ' +
    new Date(data[data.length - 1].x).toLocaleDateString('en-US', {
      day: 'numeric',
    })

  return (
    <div className="bg-canvas-0 flex h-full w-full flex-col px-24">
      {/* <!-- Profile image --> */}
      <div className="absolute left-24 top-8 flex flex-row ">
        <img
          className="bg-canvas-0 mr-6 flex h-24 w-24 items-center justify-center rounded-full"
          src={creatorAvatarUrl}
          alt=""
        />
        <div className="mt-3 flex flex-col">
          <div className="text-ink-900 flex text-3xl">{creatorName}</div>
          <div className="text-ink-500 flex text-3xl">@{creatorUsername}</div>
        </div>
      </div>

      {/* <!-- Manifold logo --> */}
      <div className="absolute right-24 top-8 flex">
        <img
          className="mr-3 h-12 w-12"
          src="https:&#x2F;&#x2F;manifold.markets&#x2F;logo.svg"
          width="40"
          height="40"
        />
        <div
          className="mt-3 flex text-3xl lowercase"
          style={{ fontFamily: 'Major Mono Display' }}
        >
          Manifold
        </div>
      </div>

      <div className={'relative mt-[6rem] flex w-full flex-row justify-center'}>
        <ProfitLossGraph data={data} height={500} aspectRatio={2.4} />
      </div>

      {/* We render the profit last so it appears over the graph*/}
      <div className="absolute left-20 top-44 flex w-full flex-row justify-between">
        {ProfitDiv(parseInt(weeklyProfit), date)}
      </div>
    </div>
  )
}

function ProfitDiv(profit: number, date: string) {
  const color = profit > 0 ? 'text-teal-500' : 'text-scarlet-500'
  return (
    <div className={'bg-canvas-0 flex flex-col rounded-md p-2 ' + color}>
      <div className="flex flex-row text-8xl">M${profit}</div>
      <div className=" flex w-full flex-row justify-center text-4xl">
        {date} profit
      </div>
    </div>
  )
}
