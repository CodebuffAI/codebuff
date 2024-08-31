import { Contract } from 'common/contract'
import { Spacer } from '../layout/spacer'
import {
  CreatorShareBoostPanel,
  NonCreatorSharePanel,
} from './creator-share-panel'

export default function ContractSharePanel(props: {
  isClosed: boolean
  isCreator: boolean
  showResolver: boolean
  contract: Contract
  className?: string
}) {
  const { isClosed, isCreator, showResolver, contract, className } = props
  const { isResolved } = contract
  return (
    <div className={className}>
      {!isResolved &&
        !isClosed &&
        (isCreator ? (
          <>
            {showResolver && <Spacer h={4} />}
            <CreatorShareBoostPanel contract={contract} />
          </>
        ) : (
          <NonCreatorSharePanel contract={contract} />
        ))}
    </div>
  )
}
