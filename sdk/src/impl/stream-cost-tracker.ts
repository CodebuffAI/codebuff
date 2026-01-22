/** Cost tracking for OpenRouter/Codebuff backend. */

import { PROFIT_MARGIN } from '@codebuff/common/old-constants'

/** Forked from https://github.com/OpenRouterTeam/ai-sdk-provider/ */
type OpenRouterUsageAccounting = {
  cost?: number | null
  costDetails?: {
    upstreamInferenceCost?: number | null
  }
}

function calculateUsedCredits(costDollars: number): number {
  return Math.round(costDollars * (1 + PROFIT_MARGIN) * 100)
}

export async function extractAndTrackCost(params: {
  providerMetadata: Record<string, unknown> | undefined
  onCostCalculated: ((credits: number) => Promise<void>) | undefined
}): Promise<void> {
  const { providerMetadata, onCostCalculated } = params

  if (!providerMetadata?.codebuff || !onCostCalculated) {
    return
  }

  const codebuffMetadata = providerMetadata.codebuff as Record<string, unknown>
  if (!codebuffMetadata.usage) {
    return
  }

  const openrouterUsage = codebuffMetadata.usage as
    | Partial<OpenRouterUsageAccounting>
    | undefined

  const costOverrideDollars =
    (openrouterUsage?.cost ?? 0) +
    (openrouterUsage?.costDetails?.upstreamInferenceCost ?? 0)

  if (costOverrideDollars) {
    await onCostCalculated(calculateUsedCredits(costOverrideDollars))
  }
}
