import { TRADE_TERM } from 'common/envs/constants'
import { InfoTooltip } from '../widgets/info-tooltip'
import { MoneyDisplay } from './money-display'

export const FeeDisplay = (props: {
  totalFees: number
  amount: number | undefined
  isCashContract?: boolean
}) => {
  const { totalFees, amount, isCashContract } = props
  return (
    <span>
      <span className="text-ink-700 font-semibold">
        <MoneyDisplay
          amount={totalFees}
          numberType="toDecimal"
          isCashContract={!!isCashContract}
        />
      </span>
      <InfoTooltip
        text={`${(amount ? (100 * totalFees) / amount : 0).toFixed(
          2
        )}% fee. Goes to the market creator up to 1000, then is split 50-50 with Manifold. Fees range from 0% to 7% of your ${TRADE_TERM} amount increasing the more unlikely your ${TRADE_TERM} is to pay out.`}
        className="text-ink-600 ml-1 mt-0.5"
        size="sm"
      />
    </span>
  )
}
