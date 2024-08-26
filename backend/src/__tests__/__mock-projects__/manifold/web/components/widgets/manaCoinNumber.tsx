import {
  formatMoneyNoMoniker,
  getMoneyNumberToDecimal,
} from 'common/util/format'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { Row } from '../layout/row'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { animated } from '@react-spring/web'
import clsx from 'clsx'
import { shortenNumber } from 'web/lib/util/formatNumber'
import { SpiceCoin } from 'web/public/custom-components/spiceCoin'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'

export type NumberDisplayType = 'short' | 'animated' | 'toDecimal'

export function CoinNumber(props: {
  amount?: number
  coinType?: 'mana' | 'spice' | 'sweepies'
  numberType?: NumberDisplayType
  className?: string
  isInline?: boolean
  coinClassName?: string
  style?: React.CSSProperties
}) {
  const {
    amount,
    coinType = 'mana',
    numberType,
    className,
    isInline,
    coinClassName,
    style,
  } = props

  return (
    <Row
      className={clsx(
        'coin-offset items-center whitespace-nowrap',
        isInline && 'relative ml-[1.1em] inline-flex',
        className
      )}
      style={style}
    >
      {amount !== undefined && amount <= -1 && '-'}
      {coinType == 'spice' ? (
        <SpiceCoin
          className={clsx(
            isInline &&
              'absolute -left-[var(--coin-offset)] top-[var(--coin-top-offset)] min-h-[1em] min-w-[1em]',
            coinClassName
          )}
        />
      ) : coinType == 'sweepies' ? (
        <SweepiesCoin
          className={clsx(
            isInline &&
              'absolute -left-[var(--coin-offset)] top-[var(--coin-top-offset)] min-h-[1em] min-w-[1em]',
            coinClassName
          )}
        />
      ) : (
        <ManaCoin
          className={clsx(
            isInline &&
              'absolute -left-[var(--coin-offset)] top-[var(--coin-top-offset)] min-h-[1em] min-w-[1em]',
            coinClassName
          )}
        />
      )}

      {amount == undefined ? (
        '---'
      ) : numberType == 'short' ? (
        shortenNumber(
          +formatMoneyNoMoniker(Math.abs(amount ?? 0)).replaceAll(',', '')
        )
      ) : numberType == 'animated' ? (
        <AnimatedNumber amount={Math.abs(amount ?? 0)} />
      ) : numberType == 'toDecimal' ? (
        getMoneyNumberToDecimal(Math.abs(amount ?? 0))
      ) : (
        formatMoneyNoMoniker(Math.abs(amount))
      )}
    </Row>
  )
}

function AnimatedNumber(props: { amount?: number }) {
  const { amount } = props
  const balance = useAnimatedNumber(amount ?? 0)
  return (
    <animated.div>{balance.to((b) => formatMoneyNoMoniker(b))}</animated.div>
  )
}
