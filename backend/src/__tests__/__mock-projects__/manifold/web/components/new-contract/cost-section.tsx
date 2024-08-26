import {
  CREATEABLE_NON_PREDICTIVE_OUTCOME_TYPES,
  CreateableOutcomeType,
} from 'common/contract'
import { ReactNode, useState } from 'react'
import { Col } from 'web/components/layout/col'

import clsx from 'clsx'
import { getTieredCost } from 'common/economy'
import { ENV_CONFIG } from 'common/envs/constants'
import { AddFundsModal } from 'web/components/add-funds-modal'
import { Button } from 'web/components/buttons/button'
import {
  CrystalTier,
  PlayTier,
  PlusTier,
  PremiumTier,
} from 'web/public/custom-components/tiers'
import { LogoIcon } from '../icons/logo-icon'
import { CoinNumber } from '../widgets/manaCoinNumber'
import { MarketTierType } from 'common/tier'
import { getPresentedTierName } from '../tiers/tier-tooltip'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { getContractTypeFromValue } from './create-contract-types'
import { InfoTooltip } from '../widgets/info-tooltip'
import { capitalize } from 'lodash'

type TIER_TYPE = { name: MarketTierType; icon: ReactNode }

export const TIERS: TIER_TYPE[] = [
  { name: 'play', icon: <PlayTier /> },
  {
    name: 'basic',
    icon: (
      <LogoIcon
        className="stroke-ink-600 flex-inline shrink-0 stroke-[1.5px]"
        aria-hidden
        style={{
          width: '1em',
          height: '1em',
          marginRight: '0.1em',
          marginBottom: '0.1em',
        }}
      />
    ),
  },
  {
    name: 'plus',
    icon: <PlusTier />,
  },
  {
    name: 'premium',
    icon: <PremiumTier />,
  },
  {
    name: 'crystal',
    icon: <CrystalTier />,
  },
] as const

const TIER_EXCLUSIONS: Partial<
  Record<CreateableOutcomeType, MarketTierType[]>
> = {
  NUMBER: ['play', 'basic'],
}

const isTierDisabled = (
  outcomeType: CreateableOutcomeType,
  tier: MarketTierType
) => {
  return TIER_EXCLUSIONS[outcomeType]?.includes(tier)
}

export const CostSection = (props: {
  balance: number
  outcomeType: CreateableOutcomeType
  baseCost: number
  marketTier: MarketTierType | undefined
  setMarketTier: (tier: MarketTierType) => void
}) => {
  const { balance, outcomeType, baseCost, marketTier, setMarketTier } = props
  const [fundsModalOpen, setFundsModalOpen] = useState(false)
  const currentCost = getTieredCost(baseCost, marketTier, outcomeType)
  return (
    <Col className="items-start px-1">
      <label className="mb-1 gap-2">
        <span>
          {CREATEABLE_NON_PREDICTIVE_OUTCOME_TYPES.includes(outcomeType)
            ? 'Cost'
            : 'Tier'}
        </span>
      </label>

      <PriceSection
        baseCost={baseCost}
        outcomeType={outcomeType}
        currentTier={marketTier}
        setMarketTier={setMarketTier}
      />

      {currentCost > balance && (
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
    </Col>
  )
}

function PriceSection(props: {
  baseCost: number
  outcomeType: CreateableOutcomeType
  currentTier: MarketTierType | undefined
  setMarketTier: (tier: MarketTierType) => void
}) {
  const { baseCost, outcomeType, currentTier, setMarketTier } = props

  if (!currentTier) {
    return <CoinNumber amount={getTieredCost(baseCost, 'basic', outcomeType)} />
  }
  return (
    <Col className="w-full gap-2">
      <div className="text-ink-600 text-sm">
        Choose a tier to determine how much initial liquidity to inject into the
        market. More liquidity attracts more traders but has a higher cost.
      </div>
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-5">
        {TIERS.map((tier: TIER_TYPE) => {
          return (
            <Tier
              key={tier.name}
              baseCost={baseCost}
              icon={tier.icon}
              tier={tier.name}
              outcomeType={outcomeType}
              currentTier={currentTier}
              setMarketTier={setMarketTier}
              isTierDisabled={isTierDisabled(outcomeType, tier.name)}
            />
          )
        })}
      </div>
    </Col>
  )
}

function Tier(props: {
  baseCost: number
  icon: ReactNode
  tier: MarketTierType
  outcomeType: CreateableOutcomeType
  currentTier: MarketTierType
  setMarketTier: (tier: MarketTierType) => void
  isTierDisabled?: boolean
}) {
  const {
    baseCost,
    icon,
    tier,
    outcomeType,
    currentTier,
    setMarketTier,
    isTierDisabled,
  } = props

  const questionType = capitalize(getContractTypeFromValue(outcomeType, 'name'))
  const tierName = getPresentedTierName(tier)

  if (isTierDisabled) {
    return (
      <div
        className={clsx(
          'bg-canvas-50 w-full select-none items-baseline rounded py-2 pl-2 pr-4 transition-colors',
          'flex flex-row justify-start gap-3 sm:flex-col sm:items-center sm:justify-between sm:gap-0'
        )}
      >
        <div className="text-ink-500 flex flex-col items-center gap-1 text-sm font-bold sm:flex-row sm:items-start">
          <div>Disabled</div>
          <InfoTooltip
            text={`The ${questionType} question type does not work with the ${tierName} tier because it requires more liquidity.`}
          />
        </div>
        <Col className="sm:items-center">
          <div className="text-ink-400">{tierName}</div>
          <div
            className="text-xl opacity-50"
            style={{ filter: 'saturate(0%)' }}
          >
            <ManaCoin />
          </div>
        </Col>
      </div>
    )
  }

  return (
    <div
      className={clsx(
        currentTier == tier
          ? tier == 'play'
            ? 'outline-ink-500'
            : tier == 'basic'
            ? 'outline-ink-500'
            : tier == 'plus'
            ? 'outline-blue-500'
            : tier == 'premium'
            ? 'outline-purple-400'
            : 'outline-pink-500'
          : tier == 'play'
          ? 'hover:outline-ink-500/50 opacity-50 outline-transparent'
          : tier == 'basic'
          ? 'hover:outline-ink-500/50 opacity-50 outline-transparent'
          : tier == 'plus'
          ? 'opacity-50 outline-transparent hover:outline-purple-500/50'
          : tier == 'premium'
          ? 'opacity-50 outline-transparent hover:outline-fuchsia-400/50'
          : 'opacity-50 outline-transparent hover:outline-pink-500/50',
        'bg-canvas-50 cursor-pointer ',
        'flex w-full select-none flex-row items-center gap-2 rounded px-4 py-2 outline transition-colors sm:flex-col sm:gap-0'
      )}
      onClick={() => {
        if (!isTierDisabled) {
          setMarketTier(tier)
        }
      }}
    >
      <div className="text-5xl sm:text-4xl">{icon}</div>
      <Col className="sm:items-center">
        <div className="text-ink-600">{getPresentedTierName(tier)}</div>
        <CoinNumber
          className="text-xl font-semibold"
          amount={getTieredCost(baseCost, tier, outcomeType)}
          numberType="short"
        />
      </Col>
    </div>
  )
}
