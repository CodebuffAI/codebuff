/* eslint-disable jsx-a11y/alt-text */
import { OgCardProps } from 'common/contract-seo'
import clsx from 'clsx'
import { ProbGraph } from './graph'
import { base64toPoints, Point } from 'common/edge/og'

// See https://github.com/vercel/satori#documentation for styling restrictions
export function OgMarket(props: OgCardProps) {
  const {
    question,
    creatorName,
    creatorAvatarUrl,
    probability,
    numericValue,
    resolution,
    topAnswer,
    points,
    bountyLeft,
  } = props
  const probabilityAsFloat = probability
    ? parseFloat(probability.replace('%', ''))
    : undefined
  const data = points ? (base64toPoints(points) as Point[]) : []
  const numTraders = Number(props.numTraders ?? 0)

  const showGraph = data && data.length > 5

  return (
    <div className="relative flex h-full w-full flex-col items-stretch justify-between bg-white pt-4">
      <div
        className={clsx(
          'mx-6 flex overflow-hidden leading-tight text-indigo-700',
          showGraph ? 'text-2xl' : 'text-3xl'
        )}
      >
        {question}
      </div>
      {topAnswer ? (
        <div className="flex w-full flex-row items-center justify-between px-8 text-black">
          <Answer {...props} />
        </div>
      ) : showGraph ? (
        <div className="flex w-full justify-center">
          <ProbGraph
            color={numericValue ? '#14bbFF' : undefined}
            data={data}
            height={120}
            aspectRatio={5}
          />
        </div>
      ) : bountyLeft ? (
        <BountyLeft bountyLeft={bountyLeft} />
      ) : null}
      {!topAnswer && (probability || numericValue || resolution) && (
        <div
          className={
            'absolute left-0 right-0 flex w-full justify-center ' +
            (showGraph ? 'top-[11rem]' : 'top-[12rem]')
          }
        >
          {probabilityAsFloat && !resolution ? (
            <div className="flex w-full justify-center text-2xl text-white">
              <div
                className={
                  'mr-3 flex h-12 w-2/5 items-center justify-center rounded-lg bg-green-500'
                }
              >
                Yes {probabilityAsFloat.toFixed(0)}%
              </div>
              <div
                className={
                  'ml-3 flex h-12 w-2/5 items-center justify-center rounded-lg bg-red-600'
                }
              >
                No {(100 - probabilityAsFloat).toFixed(0)}%
              </div>
            </div>
          ) : resolution ? (
            <Resolution
              resolution={resolution}
              label={numericValue ?? probability}
            />
          ) : numericValue ? (
            <EndValue value={numericValue} label="expected" />
          ) : probability ? (
            <EndValue value={probability} label="chance" />
          ) : null}
        </div>
      )}

      {/* Bottom row */}
      <div className="flex w-full flex-row items-center justify-between px-4 text-lg text-gray-600">
        {/* Manifold logo */}
        <div className="flex items-center pb-1">
          <img
            className="mr-1.5 h-12 w-12"
            src="https://manifold.markets/logo.svg"
            width={48}
            height={48}
          />
          <span
            className="text-3xl font-thin uppercase text-indigo-700"
            style={{ fontFamily: 'var(--font-main), Figtree-light' }}
          >
            Manifold
          </span>
        </div>

        {/* Details */}
        <div className="flex pt-1">
          <div className="mr-3 flex items-center">
            {/* Profile image */}
            {creatorAvatarUrl && (
              <img
                className="mr-1 h-6 w-6 rounded-full bg-white"
                src={creatorAvatarUrl}
              />
            )}
            <span>{creatorName}</span>
          </div>

          {!!numTraders && (
            <div className={'flex items-center'}>
              {numTraders.toLocaleString('en-US')} traders
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Answer(props: OgCardProps) {
  const { probability, topAnswer, resolution } = props
  return (
    <>
      <span className="max-h-[4rem] w-[460px] overflow-hidden text-2xl">
        {topAnswer}
      </span>
      {!resolution && probability && (
        <EndValue value={probability} label="chance" />
      )}
    </>
  )
}

function EndValue(props: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center">
      <span className="text-3xl">{props.value}</span>
      <span className="text-xl">{props.label}</span>
    </div>
  )
}

function Resolution(props: { resolution: string; label?: string }) {
  const { resolution, label } = props

  const text = {
    YES: 'Yes',
    NO: 'No',
    MKT: label ?? 'Many',
    CANCEL: 'Canceled',
  }[resolution]

  const color = {
    YES: 'bg-green-500',
    NO: 'bg-red-600',
    MKT: 'bg-blue-500',
    CANCEL: 'bg-amber-400',
  }[resolution]

  return (
    <div
      className={`flex min-w-[15rem] flex-col rounded-lg px-12 py-2 text-white ${color} items-center justify-center`}
    >
      <span className="text-4xl">{text}</span>
    </div>
  )
}

function BountyLeft(props: { bountyLeft: string }) {
  const { bountyLeft } = props
  return (
    <div className="mx-auto flex flex-col text-center text-6xl">
      <div className="mx-auto flex flex-row text-teal-600">M{bountyLeft}</div>
      <span className="mx-auto text-5xl text-gray-600">bounty</span>
    </div>
  )
}
