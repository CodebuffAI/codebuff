import { Button } from '@/components/ui/button'
import { capitalize } from 'common/src/util/string'
import { changeOrUpgrade } from '@/lib/utils'

export function PaidPlanFooter({
  currentPlan,
  planName,
  onUpgrade,
}: {
  currentPlan?: string
  planName: string
  onUpgrade: () => void
}) {
  const isUpgrade = !currentPlan || planName === 'pro' || planName === 'moar_pro'

  return (
    <div className="flex flex-col gap-4 p-6 bg-card/50">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p>{capitalize(changeOrUpgrade(isUpgrade))}</p>
        </div>
      </div>
      <Button onClick={onUpgrade} className="w-full">
        {isUpgrade ? 'Upgrade' : 'Change Plan'}
      </Button>
    </div>
  )
}
