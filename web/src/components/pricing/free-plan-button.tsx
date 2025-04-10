import { Button } from '@/components/ui/button'
import { UsageLimits } from 'common/src/constants'

export interface FreePlanButtonProps {
  currentPlan?: UsageLimits
  onUpgrade: () => void
}

export function FreePlanButton({ currentPlan, onUpgrade }: FreePlanButtonProps) {
  const isCurrentPlan = currentPlan === UsageLimits.FREE

  return (
    <Button
      onClick={onUpgrade}
      variant={isCurrentPlan ? 'outline' : 'default'}
      className="w-full"
      disabled={isCurrentPlan}
    >
      {isCurrentPlan ? 'Current Plan' : 'Switch to Free'}
    </Button>
  )
}
