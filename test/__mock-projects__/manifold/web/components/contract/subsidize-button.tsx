import clsx from 'clsx'
import { MarketContract } from 'common/contract'
import { useState } from 'react'
import { Button } from '../buttons/button'
import { Modal } from '../layout/modal'
import { Title } from '../widgets/title'
import { MODAL_CLASS } from '../layout/modal'
import { AddLiquidityPanel } from './liquidity-modal'

export function SubsidizeButton(props: {
  contract: MarketContract
  className?: string
}) {
  const { contract, className } = props
  const [open, setOpen] = useState(false)

  const disabled =
    contract.isResolved ||
    (contract.closeTime ?? Infinity) < Date.now() ||
    contract.visibility !== 'public'

  if (disabled) return <></>

  return (
    <Button
      onClick={() => setOpen(true)}
      size="md"
      color="indigo-outline"
      className={clsx(className, 'group')}
    >
      Add Liquidity
      <AddLiquidityModal contract={contract} isOpen={open} setOpen={setOpen} />
    </Button>
  )
}

export function AddLiquidityModal(props: {
  contract: MarketContract
  isOpen: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, isOpen, setOpen } = props

  const [amount, setAmount] = useState<number | undefined>(1000)

  return (
    <Modal open={isOpen} setOpen={setOpen} size="sm" className={MODAL_CLASS}>
      <Title className="!mb-2">Add Liquidity</Title>
      <AddLiquidityPanel
        contract={contract}
        amount={amount}
        setAmount={setAmount}
      />
    </Modal>
  )
}
