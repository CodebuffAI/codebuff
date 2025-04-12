import { Button } from '@/components/ui/button'
import { Loader2 as Loader } from 'lucide-react'
import { NeonGradientButton } from '@/components/ui/neon-gradient-button'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { convertCreditsToUsdCents } from 'common/src/billing/credit-conversion'

export const CREDIT_OPTIONS = [500, 1000, 2000, 5000, 10000] as const
export const CENTS_PER_CREDIT = 1

export interface CreditPurchaseSectionProps {
  onPurchase: (credits: number) => void
  onSaveAutoTopupSettings?: () => Promise<boolean>
  isAutoTopupEnabled?: boolean
  isAutoTopupPending?: boolean
  isPending?: boolean
  isPurchasePending: boolean
}

export function CreditPurchaseSection({
  onPurchase,
  onSaveAutoTopupSettings,
  isAutoTopupEnabled,
  isAutoTopupPending,
  isPending,
  isPurchasePending,
}: CreditPurchaseSectionProps) {
  const [selectedCredits, setSelectedCredits] = useState<number | null>(null)

  const handlePurchaseClick = async () => {
    if (!selectedCredits || isPurchasePending || isPending) return

    let canProceed = true
    if (isAutoTopupEnabled && onSaveAutoTopupSettings) {
      canProceed = await onSaveAutoTopupSettings()
    }

    if (canProceed) {
      onPurchase(selectedCredits)
    }
  }

  const handleCreditSelection = (credits: number) => {
    setSelectedCredits((currentSelected) =>
      currentSelected === credits ? null : credits
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {CREDIT_OPTIONS.map((credits) => {
          const costInCents = convertCreditsToUsdCents(credits, CENTS_PER_CREDIT)
          const costInDollars = (costInCents / 100).toFixed(2)

          return (
            <Button
              key={credits}
              variant="outline"
              onClick={() => handleCreditSelection(credits)}
              className={cn(
                'flex flex-col p-4 h-auto gap-1 transition-colors',
                selectedCredits === credits
                  ? 'border-primary bg-accent'
                  : 'hover:bg-accent/50'
              )}
              disabled={isPending || isPurchasePending}
            >
              <span className="text-lg font-semibold">
                {credits.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">
                ${costInDollars}
              </span>
            </Button>
          )
        })}
      </div>
      <div className="flex items-center justify-end">
        <NeonGradientButton
          onClick={handlePurchaseClick}
          disabled={!selectedCredits || isPending || isPurchasePending}
          className={cn(
            'w-auto transition-opacity min-w-[120px]',
            (!selectedCredits || isPending || isPurchasePending) && 'opacity-50'
          )}
          neonColors={{
            firstColor: '#4F46E5',
            secondColor: '#06B6D4',
          }}
        >
          {isPurchasePending ? (
            <Loader className="mr-2 size-4 animate-spin" />
          ) : null}
          Buy Credits
        </NeonGradientButton>
      </div>
    </div>
  )
}