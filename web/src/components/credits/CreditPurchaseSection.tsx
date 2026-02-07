import { Loader2 as Loader } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { dollarsToCredits } from '@/lib/currency'
import { cn } from '@/lib/utils'

const DOLLAR_OPTIONS = [10, 25, 50, 100] as const
const ORG_DOLLAR_OPTIONS = [50, 100, 250, 1000] as const

export interface CreditPurchaseSectionProps {
  onPurchase: (credits: number) => void
  onSaveAutoTopupSettings?: () => Promise<boolean>
  isAutoTopupEnabled?: boolean
  isPending?: boolean
  isPurchasePending: boolean
  isOrganization?: boolean
}

export function CreditPurchaseSection({
  onPurchase,
  onSaveAutoTopupSettings,
  isAutoTopupEnabled,
  isPending,
  isPurchasePending,
  isOrganization = false,
}: CreditPurchaseSectionProps) {
  const [cooldownActive, setCooldownActive] = useState(false)
  const [purchasingDollars, setPurchasingDollars] = useState<number | null>(
    null,
  )

  const dollarOptions = isOrganization ? ORG_DOLLAR_OPTIONS : DOLLAR_OPTIONS
  const isDisabled = isPending || isPurchasePending || cooldownActive

  const handlePurchase = async (dollars: number) => {
    if (isDisabled) return

    let canProceed = true
    if (isAutoTopupEnabled && onSaveAutoTopupSettings) {
      canProceed = await onSaveAutoTopupSettings()
    }

    if (canProceed) {
      setPurchasingDollars(dollars)
      setCooldownActive(true)
      setTimeout(() => {
        setCooldownActive(false)
        setPurchasingDollars(null)
      }, 3000)
      onPurchase(dollarsToCredits(dollars))
    }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {dollarOptions.map((dollars) => (
        <Button
          key={dollars}
          variant="outline"
          onClick={() => handlePurchase(dollars)}
          className={cn(
            'flex flex-col p-4 h-auto transition-all',
            'hover:bg-accent/50 hover:border-primary',
          )}
          disabled={isDisabled}
        >
          {isPurchasePending && purchasingDollars === dollars ? (
            <Loader className="size-5 animate-spin" />
          ) : (
            <span className="text-xl font-bold">${dollars}</span>
          )}
        </Button>
      ))}
    </div>
  )
}
