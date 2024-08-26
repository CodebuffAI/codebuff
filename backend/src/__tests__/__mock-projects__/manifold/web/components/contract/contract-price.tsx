import {
  BinaryContract,
  CPMMNumericContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import {
  BinaryContractOutcomeLabel,
  CancelLabel,
  MultiNumericValueLabel,
  NumericValueLabel,
} from 'web/components/outcome-label'
import { getMappedValue } from 'common/pseudo-numeric'
import { getDisplayProbability, getProbability } from 'common/calculate'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { ENV_CONFIG } from 'common/envs/constants'
import { animated } from '@react-spring/web'
import { getTextColor } from 'web/components/contract/text-color'
import { formatLargeNumber, formatPercent } from 'common/util/format'
import { Tooltip } from 'web/components/widgets/tooltip'
import {
  formatExpectedValue,
  getExpectedValue,
  answerTextToRange,
} from 'common/multi-numeric'

export function BinaryResolutionOrChance(props: {
  contract: BinaryContract
  className?: string
  subtextClassName?: string
  isCol?: boolean
}) {
  const { contract, className, subtextClassName, isCol } = props
  const { resolution } = contract
  const textColor = getTextColor(contract)

  const spring = useAnimatedNumber(getDisplayProbability(contract))

  return (
    <div
      className={clsx(
        'flex items-baseline gap-2 text-2xl sm:text-3xl',
        isCol ? 'flex-col' : 'flex-row',
        className
      )}
    >
      {resolution ? (
        <>
          <div className={'text-ink-800 text-base'}>
            Resolved
            {resolution === 'MKT' && ' as '}
          </div>
          <BinaryContractOutcomeLabel
            contract={contract}
            resolution={resolution}
          />
        </>
      ) : (
        <>
          <animated.div className={textColor}>
            {spring.to((val) => formatPercent(val))}
          </animated.div>
          <div
            className={clsx(
              textColor,
              'text-ink-600 text-sm',
              subtextClassName
            )}
          >
            chance
          </div>
        </>
      )}
    </div>
  )
}

export function PseudoNumericResolutionOrExpectation(props: {
  contract: PseudoNumericContract
  className?: string
}) {
  const { contract, className } = props
  const { resolution, resolutionValue, resolutionProbability } = contract

  const value = resolution
    ? resolutionValue
      ? resolutionValue
      : getMappedValue(contract, resolutionProbability ?? 0)
    : getMappedValue(contract, getProbability(contract))
  const spring = useAnimatedNumber(value)

  return (
    <Row className={clsx('items-baseline gap-2 text-3xl', className)}>
      {resolution ? (
        <>
          <div className="text-base">Resolved</div>
          {resolution === 'CANCEL' ? (
            <CancelLabel />
          ) : (
            <>
              <Tooltip text={value.toFixed(2)} placement="bottom">
                <NumericValueLabel value={value} />
              </Tooltip>
            </>
          )}
        </>
      ) : (
        <>
          <Tooltip text={value.toFixed(2)} placement="bottom">
            <animated.div>
              {spring.to((val) => formatLargeNumber(val))}
            </animated.div>
          </Tooltip>
          <div className="text-base">expected</div>
        </>
      )}
    </Row>
  )
}

export function MultiNumericResolutionOrExpectation(props: {
  contract: CPMMNumericContract
  className?: string
}) {
  const { contract, className } = props
  // TODO: display numeric resolutions
  const { resolution, resolutions } = contract

  const value = getExpectedValue(contract)
  const formattedValue = formatExpectedValue(value, contract)
  const spring = useAnimatedNumber(value)
  const resolutionBuckets = contract.answers
    .filter((a) => resolutions && resolutions[a.id])
    .map((a) => answerTextToRange(a.text))
  const smallestBucket = Math.min(...resolutionBuckets.map((b) => b[0]))
  const largestBucket = Math.max(...resolutionBuckets.map((b) => b[1]))

  return (
    <Row className={clsx('items-baseline gap-2 text-3xl', className)}>
      {resolution ? (
        <>
          <div className="text-base">Resolved</div>
          {resolution === 'CANCEL' ? (
            <CancelLabel />
          ) : (
            <>
              <Tooltip text={formattedValue} placement="bottom">
                <MultiNumericValueLabel
                  formattedValue={
                    formatExpectedValue(smallestBucket, contract) +
                    '-' +
                    formatExpectedValue(largestBucket, contract)
                  }
                />
              </Tooltip>
            </>
          )}
        </>
      ) : (
        <>
          <Tooltip text={formattedValue} placement="bottom">
            <animated.div>
              {spring.to((val) => formatExpectedValue(val, contract))}
            </animated.div>
          </Tooltip>
          <div className="text-base">expected</div>
        </>
      )}
    </Row>
  )
}

export function StonkPrice(props: {
  contract: StonkContract
  className?: string
}) {
  const { contract, className } = props

  const value = getMappedValue(contract, getProbability(contract))
  const spring = useAnimatedNumber(value)
  return (
    <Row className={clsx('text-ink-1000 items-baseline text-3xl', className)}>
      <Row>
        {ENV_CONFIG.moneyMoniker}
        <animated.div>{spring.to((val) => Math.round(val))}</animated.div>
      </Row>
      <div className="ml-2 text-base">per share</div>
    </Row>
  )
}
