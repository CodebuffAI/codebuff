import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 as Loader } from 'lucide-react'
import { NeonGradientButton } from '@/components/ui/neon-gradient-button'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { convertCreditsToUsdCents } from 'common/src/billing/credit-conversion'
import { toast } from '@/components/ui/use-toast'
import { formatDollars } from '@/lib/currency'

export const CREDIT_OPTIONS = [1000, 2500, 5000, 10000] as const
export const CENTS_PER_CREDIT = 1
const MIN_CREDITS = 500
const MAX_CREDITS = 100000

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
  const [customCredits, setCustomCredits] = useState<string>('')
  const [customError, setCustomError] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [cooldownActive, setCooldownActive] = useState(false)

  const handlePurchaseClick = async () => {
    const credits = selectedCredits || parseInt(customCredits)
    if (!credits || isProcessing || isPurchasePending || isPending || cooldownActive) return

    let canProceed = true
    if (isAutoTopupEnabled && onSaveAutoTopupSettings) {
      canProceed = await onSaveAutoTopupSettings()
    }

    if (canProceed) {
      setCooldownActive(true)
      setTimeout(() => setCooldownActive(false), 3000) // 3 second cooldown
      onPurchase(credits)
    }
  }

  const handleCreditSelection = (credits: number) => {
    setSelectedCredits((currentSelected) =>
      currentSelected === credits ? null : credits
    )
    setCustomCredits('')
    setCustomError('')
  }

  const handleCustomCreditsChange = (value: string) => {
    setCustomCredits(value)
    setSelectedCredits(null)

    if (!value) {
      setCustomError('')
      return
    }

    const numCredits = parseInt(value)
    if (isNaN(numCredits)) {
      setCustomError('Please enter a valid number')
    } else if (numCredits < MIN_CREDITS) {
      setCustomError(`Minimum ${MIN_CREDITS.toLocaleString()} credits`)
    } else if (numCredits > MAX_CREDITS) {
      setCustomError(`Maximum ${MAX_CREDITS.toLocaleString()} credits`)
    } else {
      setCustomError('')
    }
  }

  const isValid = selectedCredits || (customCredits && !customError)
  const effectiveCredits =
    selectedCredits ||
    (customCredits && !customError ? parseInt(customCredits) : null)
  const costInCents = effectiveCredits
    ? convertCreditsToUsdCents(effectiveCredits, CENTS_PER_CREDIT)
    : 0
  
  const costInDollars = formatDollars(costInCents)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {CREDIT_OPTIONS.map((credits) => {
          const optionCostInCents = convertCreditsToUsdCents(
            credits,
            CENTS_PER_CREDIT
          )
          const optionCostInDollars = formatDollars(optionCostInCents)

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
              disabled={isProcessing || isPending || isPurchasePending || cooldownActive}
            >
              <span className="text-lg font-semibold">
                {credits.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">
                ${optionCostInDollars}
              </span>
            </Button>
          )
        })}
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
        <div className="w-full flex-1 space-y-2">
          <Label htmlFor="custom-credits">Or enter a custom amount:</Label>
          <div>
            <div className="flex flex-col md:flex-row gap-4 items-start">
              <div className="w-full flex-1">
                <Input
                  id="custom-credits"
                  type="number"
                  min={MIN_CREDITS}
                  max={MAX_CREDITS}
                  value={customCredits}
                  onChange={(e) => handleCustomCreditsChange(e.target.value)}
                  placeholder={`${MIN_CREDITS.toLocaleString()} - ${MAX_CREDITS.toLocaleString()} credits`}
                  className={cn(customError && 'border-destructive')}
                  disabled={isProcessing || cooldownActive}
                />
                {customError && (
                  <p className="text-xs text-destructive mt-2 pl-1">
                    {customError}
                  </p>
                )}
                {customCredits && !customError && (
                  <p className="text-sm text-muted-foreground mt-2 pl-1">
                    We'll charge you ${costInDollars}
                  </p>
                )}
              </div>

              <NeonGradientButton
                onClick={handlePurchaseClick}
                disabled={!isValid || isProcessing || isPending || isPurchasePending || cooldownActive}
                className={cn(
                  'w-full md:w-auto transition-opacity min-w-[120px]',
                  (!isValid || isProcessing || isPending || isPurchasePending || cooldownActive) && 'opacity-50'
                )}
                neonColors={{
                  firstColor: '#4F46E5',
                  secondColor: '#06B6D4',
                }}
              >
                {(isProcessing || isPurchasePending) ? (
                  <Loader className="mr-2 size-4 animate-spin" />
                ) : null}
                Buy Credits
              </NeonGradientButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
