import clsx from 'clsx'
import { CreateableOutcomeType, MarketContract } from 'common/contract'
import { MarketTierType, getTierFromLiquidity, tiers } from 'common/tier'
import { ReactNode, useState } from 'react'
import { CrystalTier } from 'web/public/custom-components/tiers'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Title } from '../widgets/title'
import { AddLiquidityPanel } from './liquidity-modal'
import { getAnte, getTieredCost } from 'common/economy'
import { CoinNumber } from '../widgets/manaCoinNumber'
import { TierIcon, getPresentedTierName } from '../tiers/tier-tooltip'
import { api } from 'web/lib/api/api'
import { useUser } from 'web/hooks/use-user'
import { ENV_CONFIG } from 'common/envs/constants'
import { AddFundsModal } from '../add-funds-modal'
import { track } from 'web/lib/service/analytics'
import toast from 'react-hot-toast'

export function UpgradeTierButton(props: {
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

  const alreadyHighestTier =
    contract.marketTier === 'crystal' ??
    getTierFromLiquidity(contract, contract.totalLiquidity) === 'crystal'

  return (
    <Button
      onClick={() => setOpen(true)}
      size="lg"
      color="indigo-outline"
      className={clsx(className, 'group')}
    >
      <CrystalTier className="mr-2 h-5 w-5" />
      {alreadyHighestTier ? 'Add liquidity' : 'Upgrade'}
      <AddLiquidityDialogue
        contract={contract}
        isOpen={open}
        setOpen={setOpen}
      />
    </Button>
  )
}

export function AddLiquidityDialogue(props: {
  contract: MarketContract
  isOpen: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, isOpen, setOpen } = props
  const { outcomeType } = contract

  let numAnswers = undefined
  if ('answers' in contract) {
    numAnswers = contract.answers.length
  }
  const ante = getAnte(outcomeType, numAnswers)

  const currentTier =
    contract.marketTier ??
    getTierFromLiquidity(contract, contract.totalLiquidity)
  const currentTierIndex = tiers.indexOf(currentTier)
  const alreadyHighestTier = currentTier === 'crystal'

  const [amount, setAmount] = useState<number | undefined>(
    alreadyHighestTier
      ? 1000
      : getTieredCost(ante, tiers[currentTierIndex + 1], outcomeType) -
          contract.totalLiquidity
  )

  return (
    <Modal open={isOpen} setOpen={setOpen} size="sm">
      <Col className="bg-canvas-0 gap-2.5  rounded p-4 pb-8 sm:gap-4">
        <Title className="!mb-2">
          {alreadyHighestTier ? 'Add liquidity' : 'Upgrade Tier'}
        </Title>
        {alreadyHighestTier ? (
          <AddLiquidityPanel
            contract={contract}
            amount={amount}
            setAmount={setAmount}
          />
        ) : (
          <UpgradeTierContent
            currentTierIndex={currentTierIndex}
            contract={contract}
            ante={ante}
            amount={amount}
            setAmount={setAmount}
            setOpen={setOpen}
          />
        )}
      </Col>
    </Modal>
  )
}

function UpgradeTierContent(props: {
  currentTierIndex: number
  contract: MarketContract
  ante: number
  amount: number | undefined
  setAmount: (amount: number | undefined) => void
  setOpen: (open: boolean) => void
}) {
  const { currentTierIndex, contract, ante, amount, setAmount, setOpen } = props
  const { outcomeType, id: contractId, slug } = contract
  const totalOptions = tiers.length - 1 - currentTierIndex

  const [error, setError] = useState<string | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(false)

  const submit = async () => {
    if (!amount) return

    setIsLoading(true)

    try {
      await api('market/:contractId/add-liquidity', {
        amount,
        contractId,
      })
      setError(undefined)
      track('upgrade market', { amount, contractId, slug })
      setOpen(false)
      toast('Your market has been upgraded!', {
        icon: '🚀',
      })
    } catch (e) {
      setError('Server error')
    } finally {
      setIsLoading(false)
    }
  }

  const user = useUser()
  const [fundsModalOpen, setFundsModalOpen] = useState(false)

  const notEnoughFunds = !!user && !!amount && user.balance < amount

  return (
    <>
      <div
        className={clsx(
          'w-full gap-2',
          totalOptions > 2 ? 'grid grid-cols-2' : 'flex flex-row'
        )}
      >
        {tiers.slice(currentTierIndex + 1).map((tier) => (
          <UpgradeTier
            key={tier}
            contract={contract}
            baseCost={ante}
            icon={<TierIcon tier={tier} />}
            tier={tier}
            outcomeType={outcomeType}
            currentAmount={amount}
            onClick={(upgradeCost) => setAmount(upgradeCost)}
          />
        ))}
      </div>
      <Button
        disabled={isLoading || !!error || !amount || notEnoughFunds}
        onClick={submit}
        loading={isLoading}
      >
        Upgrade{' '}
        {amount &&
          `to ${getTierFromLiquidity(
            contract,
            amount + contract.totalLiquidity
          )}`}
      </Button>
      {notEnoughFunds && (
        <div className="mb-2 mr-auto mt-2 self-center whitespace-nowrap text-xs font-medium tracking-wide">
          <span className="text-scarlet-500 mr-2">Insufficient balance</span>
          <Button
            size="xs"
            color="green"
            onClick={() => setFundsModalOpen(true)}
          >
            Get {ENV_CONFIG.moneyMoniker}
          </Button>
          <AddFundsModal open={fundsModalOpen} setOpen={setFundsModalOpen} />
        </div>
      )}
    </>
  )
}

function UpgradeTier(props: {
  contract: MarketContract
  baseCost: number
  icon: ReactNode
  tier: MarketTierType
  outcomeType: CreateableOutcomeType
  onClick: (upgradeCost: number) => void
  currentAmount?: number
}) {
  const {
    contract,
    baseCost,
    icon,
    tier,
    outcomeType,
    onClick,
    currentAmount,
  } = props

  const additionalAmount =
    getTieredCost(baseCost, tier, outcomeType) - contract.totalLiquidity
  return (
    <Col
      className={clsx(
        currentAmount == additionalAmount
          ? tier == 'basic'
            ? 'outline-ink-500'
            : tier == 'plus'
            ? 'outline-blue-500'
            : tier == 'premium'
            ? 'outline-purple-400'
            : 'outline-pink-500'
          : tier == 'basic'
          ? 'hover:outline-ink-500/50 opacity-50 outline-transparent'
          : tier == 'plus'
          ? 'opacity-50 outline-transparent hover:outline-purple-500/50'
          : tier == 'premium'
          ? 'opacity-50 outline-transparent hover:outline-fuchsia-400/50'
          : 'opacity-50 outline-transparent hover:outline-pink-500/50',
        'bg-canvas-50 w-full cursor-pointer select-none items-center rounded px-4 py-2 outline transition-colors'
      )}
      onClick={() => onClick(additionalAmount)}
    >
      <div className="text-4xl sm:text-5xl">{icon}</div>
      <div className="text-ink-600">{getPresentedTierName(tier)}</div>
      <CoinNumber className="text-xl font-semibold" amount={additionalAmount} />
    </Col>
  )
}
