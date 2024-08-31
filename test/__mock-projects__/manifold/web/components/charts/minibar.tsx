import { getAnswerProbability } from 'common/calculate'
import { MultiContract } from 'common/contract'
import { getAnswerColor } from './contract/choice'
import { sortAnswers } from 'common/answer'
import clsx from 'clsx'
import { formatPercent } from 'common/util/format'

/** Sparklineish stacked bar chart. Values sum to 1 */
export const MiniStackedBar = (props: {
  options: { prob: number; label: string; color: string }[]
  width?: string
}) => {
  const { options, width = 'w-[3ch]' } = props
  return (
    <div
      className={clsx('bg-canvas-0/50 relative my-0.5 inline-flex h-5', width)}
    >
      {options.map((option, i) => (
        <span
          key={i}
          className="group"
          style={{
            width: option.prob * 100 + '%',
            backgroundColor: option.color,
          }}
        >
          <Tooltip {...option} />
        </span>
      ))}
    </div>
  )
}

/** Sparklineish bar chart. Values are between 0-1 */
export const MiniBar = (props: {
  options: { prob: number; label: string; color: string }[]
  width?: string
}) => {
  const { options, width = 'w-[3ch]' } = props

  return (
    <span className="bg-canvas-0/50 inline-flex align-top">
      <div className={clsx('relative grid h-5', width)}>
        {options.map((option, i) => (
          <span
            key={i}
            className="group"
            style={{
              width: option.prob * 100 + '%',
              backgroundColor: option.color,
            }}
          >
            <Tooltip {...option} />
          </span>
        ))}
      </div>
    </span>
  )
}

const Tooltip = (props: { prob: number; label: string; color: string }) => {
  const { prob, label, color } = props
  return (
    <div
      className={clsx(
        'absolute bottom-0 right-0 z-10 hidden w-[50vw] max-w-[30ch] translate-y-full justify-end group-hover:flex'
      )}
    >
      <div
        className="bg-canvas-0 border-canvas-100 mt-1 flex max-w-full gap-1 rounded border p-1 text-xs"
        style={{ borderColor: color }}
      >
        <div className="font-semibold">{formatPercent(prob)}</div>
        <div className="line-clamp-3 font-normal">{label}</div>
      </div>
    </div>
  )
}

export const ContractMinibar = (props: {
  contract: MultiContract
  width?: string
}) => {
  const { contract, width } = props
  const answers = sortAnswers(contract, contract.answers)

  const sumsToOne = contract.shouldAnswersSumToOne

  const answersToShow = sumsToOne ? answers : answers.slice(0, 3)
  const options = answersToShow.map((a) => ({
    label: a.text,
    prob: getAnswerProbability(contract, a.id),
    color: getAnswerColor(a),
  }))

  if (sumsToOne) {
    return <MiniStackedBar width={width} options={options} />
  } else {
    return <MiniBar width={width} options={options} />
  }
}
