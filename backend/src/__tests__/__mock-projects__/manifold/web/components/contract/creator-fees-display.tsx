import { Contract } from 'common/contract'
import { formatMoneyWithDecimals } from 'common/util/format'
import { Tooltip } from '../widgets/tooltip'
import clsx from 'clsx'

export const CreatorFeesDisplay = (props: {
  contract: Contract
  className?: string
}) => {
  const { contract, className } = props
  const { collectedFees } = contract
  return (
    <Tooltip
      text={'Fees earned from trade volume'}
      placement="bottom"
      noTap
      className={clsx(className, 'text-ink-600 text-sm')}
    >
      {formatMoneyWithDecimals(collectedFees.creatorFee)} earned
    </Tooltip>
  )
}
