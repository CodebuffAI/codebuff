'use client'

import { useCustomer } from 'autumn-js/react'
import {
  type BooleanFeatureId,
  FEATURE_DISPLAY_NAMES,
  FEATURE_MINIMUM_TIER,
  PLAN_BASE_CREDITS,
  ORIGINAL_PRICES,
  TIER_LIMITS,
  BOOLEAN_FEATURES,
  TIER_ORDER,
  type TierName,
} from '@/vly/autumn/constants'
import { hasFeatureAccess } from '@/vly/autumn/helpers'
import { ReactNode, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import {
  starterPlan,
  hobbyPlan,
  businessPlan,
  scalePlan,
  priorityPlan,
  ultraPlan,
  maxPlan,
  unlimitedPlan,
} from '@/vly/autumn.config'
import { toast } from 'sonner'
import { useConfetti } from '@/vly/hooks/use-confetti'

const AGENT_CREDITS_FEATURE_ID = 'agent_credits'
import { CheckCircle2, Loader2 } from 'lucide-react'
import {
  formatCredits,
  getFormattedPrice,
  getFormattedPriceWithPeriod,
  getFormattedOriginalPrice,
} from '@/vly/autumn/helpers'
import { ReviewComparisonCompact } from '@/vly/components/test-landing/ReviewComparison'

export interface FeatureGateProps {
  /**
   * Feature ID to check access for
   */
  featureId: BooleanFeatureId

  /**
   * Content to show when user has access
   */
  children: ReactNode

  /**
   * Optional fallback content to show when user doesn't have access
   * If not provided, nothing will be rendered
   */
  fallback?: ReactNode

  /**
   * Optional loading state while checking access
   */
  loadingFallback?: ReactNode
}

/**
 * Feature Gate Component
 *
 * Conditionally renders children based on user's feature access.
 * Respects the billing_enforcement feature flag.
 *
 * @example
 * ```tsx
 * <FeatureGate featureId="github_integration">
 *   <GitHubSyncButton />
 * </FeatureGate>
 * ```
 *
 * @example With fallback
 * ```tsx
 * <FeatureGate
 *   featureId="custom_domains"
 *   fallback={<UpgradePrompt featureId="custom_domains" />}
 * >
 *   <CustomDomainSettings />
 * </FeatureGate>
 * ```
 */
export function FeatureGate({
  featureId,
  children,
  fallback = null,
  loadingFallback = null,
}: FeatureGateProps) {
  const { customer, isLoading: isCustomerLoading } = useCustomer()

  // Show loading fallback while data is loading
  if (isCustomerLoading) {
    return <>{loadingFallback}</>
  }

  // Check feature access directly from customer object
  // This properly checks customer.features[featureId]?.has_access === true
  const hasAccess = hasFeatureAccess(customer, featureId)

  if (hasAccess) {
    return <>{children}</>
  }

  return <>{fallback}</>
}

export interface UpgradePromptProps {
  /**
   * Feature ID that requires upgrade
   * Optional if requiredPlan is provided
   */
  featureId?: BooleanFeatureId

  /**
   * Required plan for upgrade
   * If provided without featureId, shows a generic upgrade prompt for this plan
   */
  requiredPlan?:
    | 'Starter'
    | 'Hobby'
    | 'Business'
    | 'Scale'
    | 'Priority'
    | 'Ultra'
    | 'Max'
    | 'Unlimited'

  /**
   * Custom message to show (optional)
   * If not provided, uses default message based on feature
   */
  message?: string

  /**
   * Custom title to show (optional)
   * If not provided, uses default title based on feature
   */
  title?: string

  /**
   * Variant style
   * @default "default"
   */
  variant?: 'default' | 'compact' | 'inline'

  /**
   * Optional callback when upgrade button is clicked
   */
  onUpgradeClick?: () => void

  /**
   * Whether to show the upgrade button
   * @default true
   */
  showUpgradeButton?: boolean

  /**
   * Whether to hide the title (useful when used inside a dialog with its own title)
   * @default false
   */
  hideTitle?: boolean

  /**
   * Whether to use borderless/transparent styling (useful when embedded in dialogs)
   * @default false
   */
  borderless?: boolean
}

/**
 * Upgrade Prompt Component
 *
 * Shows a message prompting the user to upgrade to access a feature.
 *
 * @example
 * ```tsx
 * <UpgradePrompt featureId="github_integration" />
 * ```
 *
 * @example Compact inline variant
 * ```tsx
 * <UpgradePrompt
 *   featureId="custom_domains"
 *   variant="inline"
 *   showUpgradeButton={false}
 * />
 * ```
 */
// Map tier names to plan objects (supports both capitalized and lowercase keys)
const TIER_TO_PLAN: Record<string, any> = {
  // Capitalized (for explicit requiredPlan prop)
  Starter: starterPlan,
  Hobby: hobbyPlan,
  Business: businessPlan,
  Scale: scalePlan,
  Priority: priorityPlan,
  Ultra: ultraPlan,
  Max: maxPlan,
  Unlimited: unlimitedPlan,
  // Lowercase (from FEATURE_MINIMUM_TIER auto-derived map)
  starter: starterPlan,
  hobby: hobbyPlan,
  business: businessPlan,
  scale: scalePlan,
  priority: priorityPlan,
  ultra: ultraPlan,
  max: maxPlan,
  unlimited: unlimitedPlan,
  // Legacy aliases
  Pro: businessPlan,
  pro: businessPlan,
}

// Build comprehensive feature list for a tier with dynamic values
function getAllFeaturesForTier(
  tier: string,
): { category: string; features: string[] }[] {
  const tierKey = tier.toLowerCase() as TierName
  const limits = TIER_LIMITS[tierKey] || TIER_LIMITS.starter
  const tierIndex = TIER_ORDER.indexOf(tierKey)

  // Collect all boolean features for this tier and below
  const enabledBooleanFeatures: string[] = []
  for (const [featureTier, features] of Object.entries(BOOLEAN_FEATURES)) {
    const featureTierIndex = TIER_ORDER.indexOf(featureTier as TierName)
    if (featureTierIndex <= tierIndex && featureTierIndex > 0) {
      for (const featureId of features) {
        const displayName =
          FEATURE_DISPLAY_NAMES[featureId] ||
          featureId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        enabledBooleanFeatures.push(displayName)
      }
    }
  }

  // Dynamic features (credits, limits, etc.)
  const dynamicFeatures: string[] = []

  // Agent credits
  const credits = limits.agentCredits
  dynamicFeatures.push(
    `${formatCredits(credits)} Agent Credits (Worth $${Math.round(credits / 1_000_000)})`,
  )

  // Projects
  dynamicFeatures.push(`${limits.maxProjects} Projects`)

  // Total members across all projects
  if (limits.totalMembers > 1) {
    dynamicFeatures.push(`${limits.totalMembers} Total Members`)
  }

  // Team seats (if available)
  if (limits.teamSeats > 0) {
    dynamicFeatures.push(`${limits.teamSeats} Team Seats`)
  }

  // Sandboxes
  if (tierIndex >= 3) {
    // business+
    dynamicFeatures.push('Small, Medium & Large Sandboxes')
  } else if (tierIndex >= 2) {
    // hobby
    dynamicFeatures.push('Small & Medium Sandboxes')
  } else {
    dynamicFeatures.push('Small Sandboxes')
  }

  // Convex resources
  const fnCalls = limits.convexFunctionCalls
  const fnCallsFormatted =
    fnCalls >= 1_000_000
      ? `${fnCalls / 1_000_000}M`
      : fnCalls >= 1000
        ? `${fnCalls / 1000}K`
        : fnCalls.toString()
  dynamicFeatures.push(`${fnCallsFormatted} Function Calls`)
  dynamicFeatures.push(`${limits.convexCompute} GB Compute`)
  dynamicFeatures.push(
    `${limits.convexDatabaseBW + limits.convexFileBW} GB Bandwidth`,
  )

  // Email & AI integrations
  if (limits.emailCredits > 0) {
    dynamicFeatures.push(`${limits.emailCredits} Email Sends/month`)
  }
  if (limits.llmCredits > 0) {
    dynamicFeatures.push(`${limits.llmCredits} AI Integration Calls/month`)
  }

  // Community badge
  if (limits.communityBadgeTier > 0) {
    dynamicFeatures.push(`Community Badge Tier ${limits.communityBadgeTier}`)
  }

  return [
    { category: 'Resources', features: dynamicFeatures },
    { category: 'Features', features: enabledBooleanFeatures },
  ]
}

export function UpgradePrompt({
  featureId,
  requiredPlan: requiredPlanProp,
  message,
  title,
  variant = 'default',
  onUpgradeClick,
  showUpgradeButton = true,
  hideTitle = false,
  borderless = false,
}: UpgradePromptProps) {
  const router = useRouter()
  const { attach, refetch, customer } = useCustomer()
  const { fireUpgrade } = useConfetti()
  const grantUpgradeBonusCredits = useAction(
    api.autumn.grantUpgradeBonusCredits,
  )
  const unpauseDeployments = useAction(
    api.deployment_management.unpauseCurrentUserDeployments,
  )
  const [isLoading, setIsLoading] = useState(false)

  // Determine feature name and required plan
  const featureName = featureId ? FEATURE_DISPLAY_NAMES[featureId] : undefined
  const requiredPlan =
    requiredPlanProp ??
    (featureId ? FEATURE_MINIMUM_TIER[featureId] : 'Starter')

  // Get the target plan based on required tier
  const targetPlan = TIER_TO_PLAN[requiredPlan] || starterPlan
  const tierKey = requiredPlan.toLowerCase() as TierName
  const planPrice = getFormattedPrice(tierKey)
  const originalPrice =
    tierKey === 'starter' ||
    tierKey === 'hobby' ||
    tierKey === 'business' ||
    tierKey === 'scale' ||
    tierKey === 'priority'
      ? getFormattedOriginalPrice(tierKey)
      : undefined
  const planName = `${requiredPlan} Plan`

  const defaultTitle =
    title ||
    (featureName
      ? `Unlock ${featureName} with ${planName}`
      : `Upgrade to ${planName}`)
  const defaultMessage =
    message ||
    (featureName
      ? `${featureName} is not available on your current plan. Upgrade to ${requiredPlan} or higher to access this feature.`
      : `Upgrade to ${planName} to unlock more features and capabilities.`)

  const handleQuickUpgrade = async () => {
    if (onUpgradeClick) {
      onUpgradeClick()
      return
    }

    setIsLoading(true)
    const currentBalance =
      (customer?.features as any)?.[AGENT_CREDITS_FEATURE_ID]?.balance ?? 0
    console.log('[UpgradePrompt] Starting upgrade to:', {
      planId: targetPlan.id,
      planName: planName,
      tierKey: tierKey,
    })

    try {
      await attach({
        productId: targetPlan.id,
        successUrl: window.location.href,
      })

      if (currentBalance > 0) {
        try {
          const bonusResult = await grantUpgradeBonusCredits({
            featureId: AGENT_CREDITS_FEATURE_ID,
            amount: currentBalance,
            reason: `Credits preserved from previous plan (upgrade to ${planName})`,
          })
          if (!bonusResult.success) {
            console.error(
              '[UpgradePrompt] Failed to grant bonus credits:',
              bonusResult.error,
            )
          }
        } catch (e) {
          console.error('[UpgradePrompt] Error granting bonus credits:', e)
        }
      }

      try {
        const unpauseResult = await unpauseDeployments()
        if (unpauseResult?.unpaused && unpauseResult?.success) {
          toast.success(
            `Deployments unpaused! Restarting ${unpauseResult.successCount} deployment${unpauseResult.successCount !== 1 ? 's' : ''}...`,
          )
        }
      } catch (e) {
        console.error('[UpgradePrompt] Unpause error:', e)
      }

      fireUpgrade()
      try {
        await refetch()
      } catch (refetchError) {
        console.error(
          '[UpgradePrompt] Failed to refetch customer balance:',
          refetchError,
        )
      }
      toast.success(`Successfully upgraded to ${planName}!`)
    } catch (error: any) {
      console.error('[UpgradePrompt] Upgrade error:', {
        error,
        message: error?.message,
        code: error?.code,
        data: error?.data,
        response: error?.response,
        planId: targetPlan.id,
      })

      // Check if error contains a URL for redirect (Stripe checkout)
      const redirectUrl =
        error?.url ||
        error?.data?.url ||
        (error?.response?.data as any)?.url ||
        (error as any)?.checkout_url
      if (redirectUrl) {
        console.log(
          '[UpgradePrompt] Redirecting to Stripe checkout:',
          redirectUrl,
        )
        window.location.href = redirectUrl
        return
      }

      // If error indicates payment method needed, redirect to billing
      if (
        error?.message?.includes('payment') ||
        error?.message?.includes('Payment') ||
        error?.message?.includes('payment_method')
      ) {
        toast.info('Payment method required. Redirecting to billing...')
        router.push('/web/dashboard')
      } else {
        const errorMessage =
          error?.message || error?.data?.message || 'Unknown error'
        toast.error(
          `Failed to upgrade: ${errorMessage}. Redirecting to billing page...`,
        )
        console.error('[UpgradePrompt] Detailed error:', errorMessage)
        // Fallback to billing page
        setTimeout(() => {
          router.push('/web/dashboard')
        }, 1500)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleViewPlans = () => {
    if (onUpgradeClick) {
      onUpgradeClick()
    } else {
      router.push('/web/dashboard')
    }
  }

  if (variant === 'inline') {
    return (
      <span className="text-sm text-muted-foreground">
        {message || `Requires ${requiredPlan} plan`}
      </span>
    )
  }

  // Get comprehensive feature list
  const allFeatures = getAllFeaturesForTier(requiredPlan)

  // Both compact and default use the same full design with feature list
  return (
    <div
      className={
        borderless
          ? 'flex flex-col'
          : 'flex flex-col rounded-lg border border-border bg-card text-card-foreground'
      }
    >
      {/* Content area - expands vertically, container handles scrolling */}
      <div className={borderless ? '' : 'p-6'}>
        {/* Title - hidden when hideTitle is true */}
        {!hideTitle && (
          <h3 className="mb-2 text-lg font-semibold">{defaultTitle}</h3>
        )}

        {/* Message */}
        <p className="mb-4 text-sm text-muted-foreground">
          {message || defaultMessage}
        </p>

        {/* Price Section */}
        <div className="mb-4 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              {originalPrice && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground line-through">
                    {originalPrice}
                  </span>
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-700">
                    50% off
                  </span>
                </div>
              )}
              <div className="text-2xl font-bold text-primary">{planPrice}</div>
              <div className="text-xs text-muted-foreground">per month</div>
              {originalPrice && (
                <div className="mt-0.5 text-[10px] font-medium text-purple-600">
                  Early user pricing
                </div>
              )}
            </div>
          </div>

          {/* Upgrade Buttons - Right below price */}
          {showUpgradeButton && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={handleQuickUpgrade}
                disabled={isLoading}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Confirm Upgrade'
                )}
              </button>
              <button
                onClick={handleViewPlans}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                View All Plans
              </button>
            </div>
          )}
        </div>

        {/* Comprehensive Feature List */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold">
            Everything you get with {planName}:
          </h4>

          {allFeatures.map((section) => (
            <div
              key={section.category}
              className="rounded-lg border border-border bg-muted/20 p-3"
            >
              <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.category}
              </h5>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {section.features.map((feature) => (
                  <div
                    key={feature}
                    className="flex items-center gap-2 text-sm"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                    <span className="text-muted-foreground">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Founders note */}
          <div className="rounded-lg border border-purple-200/60 bg-purple-50/50 p-3 text-center">
            <p className="text-xs leading-relaxed text-purple-700">
              💜 We don't profit from subscriptions—your support keeps vly
              alive.{' '}
              <a
                href="https://discord.gg/yXG3w7wxfs"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline hover:text-purple-900"
              >
                Join Discord
              </a>{' '}
              to meet the founders!
            </p>
          </div>

          {/* Review Comparison */}
          <div className="mt-4">
            <ReviewComparisonCompact />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Tier Upgrade Prompt Component
 * Shows a dialog prompting users to upgrade to the next tier when they run out of credits
 */
export interface TierUpgradePromptProps {
  /**
   * Target tier to upgrade to
   */
  targetTier:
    | 'Starter'
    | 'Hobby'
    | 'Business'
    | 'Scale'
    | 'Priority'
    | 'Ultra'
    | 'Max'
    | 'Unlimited'

  /**
   * Custom message to show (optional)
   */
  message?: string

  /**
   * Custom title to show (optional)
   */
  title?: string

  /**
   * Optional callback when upgrade button is clicked
   */
  onUpgradeClick?: () => void

  /**
   * Whether to show the upgrade button
   * @default true
   */
  showUpgradeButton?: boolean
}

export function TierUpgradePrompt({
  targetTier,
  message,
  title,
  onUpgradeClick,
  showUpgradeButton = true,
}: TierUpgradePromptProps) {
  const router = useRouter()
  const { attach, refetch, customer } = useCustomer()
  const { fireUpgrade } = useConfetti()
  const grantUpgradeBonusCredits = useAction(
    api.autumn.grantUpgradeBonusCredits,
  )
  const unpauseDeployments = useAction(
    api.deployment_management.unpauseCurrentUserDeployments,
  )
  const [isLoading, setIsLoading] = useState(false)

  const targetPlan = TIER_TO_PLAN[targetTier] || starterPlan
  const tierKey = targetTier.toLowerCase() as TierName
  const planPrice = getFormattedPrice(tierKey)
  const originalPrice =
    tierKey === 'starter' ||
    tierKey === 'hobby' ||
    tierKey === 'business' ||
    tierKey === 'scale' ||
    tierKey === 'priority'
      ? getFormattedOriginalPrice(tierKey)
      : undefined
  const allFeatures = getAllFeaturesForTier(targetTier)
  const tierCredits = PLAN_BASE_CREDITS[tierKey] || PLAN_BASE_CREDITS.starter

  const defaultTitle = title || `Get More Credits with ${targetTier} Plan`
  const defaultMessage =
    message ||
    `Upgrade to ${targetTier} plan (${getFormattedPriceWithPeriod(tierKey)}) to get ${formatCredits(tierCredits)} credits and continue building with AI assistance.`

  const handleQuickUpgrade = async () => {
    if (onUpgradeClick) {
      onUpgradeClick()
      return
    }

    setIsLoading(true)
    const currentBalance =
      (customer?.features as any)?.[AGENT_CREDITS_FEATURE_ID]?.balance ?? 0
    console.log('[TierUpgradePrompt] Starting upgrade to:', {
      planId: targetPlan.id,
      targetTier: targetTier,
      tierKey: tierKey,
    })

    try {
      await attach({
        productId: targetPlan.id,
        successUrl: window.location.href,
      })

      if (currentBalance > 0) {
        try {
          const bonusResult = await grantUpgradeBonusCredits({
            featureId: AGENT_CREDITS_FEATURE_ID,
            amount: currentBalance,
            reason: `Credits preserved from previous plan (upgrade to ${targetTier} Plan)`,
          })
          if (!bonusResult.success) {
            console.error(
              '[TierUpgradePrompt] Failed to grant bonus credits:',
              bonusResult.error,
            )
          }
        } catch (e) {
          console.error('[TierUpgradePrompt] Error granting bonus credits:', e)
        }
      }

      try {
        const unpauseResult = await unpauseDeployments()
        if (unpauseResult?.unpaused && unpauseResult?.success) {
          toast.success(
            `Deployments unpaused! Restarting ${unpauseResult.successCount} deployment${unpauseResult.successCount !== 1 ? 's' : ''}...`,
          )
        }
      } catch (e) {
        console.error('[TierUpgradePrompt] Unpause error:', e)
      }

      fireUpgrade()
      try {
        await refetch()
      } catch (refetchError) {
        console.error(
          '[TierUpgradePrompt] Failed to refetch customer balance:',
          refetchError,
        )
      }
      toast.success(`Successfully upgraded to ${targetTier} Plan!`)
    } catch (error: any) {
      console.error('[TierUpgradePrompt] Upgrade error:', {
        error,
        message: error?.message,
        code: error?.code,
        data: error?.data,
        response: error?.response,
        planId: targetPlan.id,
      })

      const redirectUrl =
        error?.url ||
        error?.data?.url ||
        (error?.response?.data as any)?.url ||
        (error as any)?.checkout_url
      if (redirectUrl) {
        console.log(
          '[TierUpgradePrompt] Redirecting to Stripe checkout:',
          redirectUrl,
        )
        window.location.href = redirectUrl
        return
      }

      if (
        error?.message?.includes('payment') ||
        error?.message?.includes('Payment') ||
        error?.message?.includes('payment_method')
      ) {
        toast.info('Payment method required. Redirecting to billing...')
        router.push('/web/dashboard')
      } else {
        const errorMessage =
          error?.message || error?.data?.message || 'Unknown error'
        toast.error(
          `Failed to upgrade: ${errorMessage}. Redirecting to billing page...`,
        )
        console.error('[TierUpgradePrompt] Detailed error:', errorMessage)
        setTimeout(() => {
          router.push('/web/dashboard')
        }, 1500)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleViewPlans = () => {
    if (onUpgradeClick) {
      onUpgradeClick()
    } else {
      router.push('/web/dashboard')
    }
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card text-card-foreground">
      {/* Content area - expands vertically, container handles scrolling */}
      <div className="p-6">
        {/* Title */}
        <h3 className="mb-2 text-lg font-semibold">{defaultTitle}</h3>

        {/* Message */}
        <p className="mb-4 text-sm text-muted-foreground">
          {message || defaultMessage}
        </p>

        {/* Price Section */}
        <div className="mb-4 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              {originalPrice && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground line-through">
                    {originalPrice}
                  </span>
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-700">
                    50% off
                  </span>
                </div>
              )}
              <div className="text-2xl font-bold text-primary">{planPrice}</div>
              <div className="text-xs text-muted-foreground">per month</div>
              {originalPrice && (
                <div className="mt-0.5 text-[10px] font-medium text-purple-600">
                  Early user pricing
                </div>
              )}
            </div>
          </div>

          {/* Upgrade Buttons - Right below price */}
          {showUpgradeButton && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={handleQuickUpgrade}
                disabled={isLoading}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Confirm Upgrade'
                )}
              </button>
              <button
                onClick={handleViewPlans}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                View All Plans
              </button>
            </div>
          )}
        </div>

        {/* Comprehensive Feature List */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold">
            Everything you get with {targetTier} Plan:
          </h4>

          {allFeatures.map((section) => (
            <div
              key={section.category}
              className="rounded-lg border border-border bg-muted/20 p-3"
            >
              <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.category}
              </h5>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {section.features.map((feature) => (
                  <div
                    key={feature}
                    className="flex items-center gap-2 text-sm"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                    <span className="text-muted-foreground">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Founders note */}
          <div className="rounded-lg border border-purple-200/60 bg-purple-50/50 p-3 text-center">
            <p className="text-xs leading-relaxed text-purple-700">
              💜 We don't profit from subscriptions—your support keeps vly
              alive.{' '}
              <a
                href="https://discord.gg/yXG3w7wxfs"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline hover:text-purple-900"
              >
                Join Discord
              </a>{' '}
              to meet the founders!
            </p>
          </div>

          <div className="mt-4">
            <ReviewComparisonCompact />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * @deprecated Use TierUpgradePrompt with targetTier="Business" instead
 */
export function ProUpgradePrompt(
  props: Omit<TierUpgradePromptProps, 'targetTier'>,
) {
  return <TierUpgradePrompt {...props} targetTier="Business" />
}

/**
 * Collaborator Upgrade Prompt Component
 * Shows a dialog prompting users to upgrade for more team members
 */
export interface CollaboratorUpgradePromptProps {
  /**
   * Optional callback when upgrade button is clicked
   */
  onUpgradeClick?: () => void

  /**
   * Whether to show the upgrade button
   * @default true
   */
  showUpgradeButton?: boolean
}

// Collaborator upgrade uses the comprehensive feature list from getAllFeaturesForTier

export function CollaboratorUpgradePrompt({
  onUpgradeClick,
  showUpgradeButton = true,
}: CollaboratorUpgradePromptProps) {
  const router = useRouter()
  const { attach, refetch, customer } = useCustomer()
  const { fireUpgrade } = useConfetti()
  const grantUpgradeBonusCredits = useAction(
    api.autumn.grantUpgradeBonusCredits,
  )
  const unpauseDeployments = useAction(
    api.deployment_management.unpauseCurrentUserDeployments,
  )
  const [isLoading, setIsLoading] = useState(false)

  const allFeatures = getAllFeaturesForTier('Business')

  const handleQuickUpgrade = async () => {
    setIsLoading(true)
    const currentBalance =
      (customer?.features as any)?.[AGENT_CREDITS_FEATURE_ID]?.balance ?? 0
    console.log(
      '[CollaboratorUpgradePrompt] Starting upgrade to Business plan:',
      { planId: businessPlan.id },
    )

    try {
      await attach({
        productId: businessPlan.id,
        successUrl: window.location.href,
      })

      if (currentBalance > 0) {
        try {
          const bonusResult = await grantUpgradeBonusCredits({
            featureId: AGENT_CREDITS_FEATURE_ID,
            amount: currentBalance,
            reason: `Credits preserved from previous plan (upgrade to Business Plan)`,
          })
          if (!bonusResult.success) {
            console.error(
              '[CollaboratorUpgradePrompt] Failed to grant bonus credits:',
              bonusResult.error,
            )
          }
        } catch (e) {
          console.error(
            '[CollaboratorUpgradePrompt] Error granting bonus credits:',
            e,
          )
        }
      }

      try {
        const unpauseResult = await unpauseDeployments()
        if (unpauseResult?.unpaused && unpauseResult?.success) {
          toast.success(
            `Deployments unpaused! Restarting ${unpauseResult.successCount} deployment${unpauseResult.successCount !== 1 ? 's' : ''}...`,
          )
        }
      } catch (e) {
        console.error('[CollaboratorUpgradePrompt] Unpause error:', e)
      }

      fireUpgrade()
      try {
        await refetch()
      } catch (refetchError) {
        console.error(
          '[CollaboratorUpgradePrompt] Failed to refetch customer balance:',
          refetchError,
        )
      }
      toast.success('Successfully upgraded to Business Plan!')
      if (onUpgradeClick) onUpgradeClick()
    } catch (error: any) {
      console.error('[CollaboratorUpgradePrompt] Upgrade error:', {
        error,
        message: error?.message,
        code: error?.code,
        data: error?.data,
        response: error?.response,
        planId: businessPlan.id,
      })

      const redirectUrl =
        error?.url ||
        error?.data?.url ||
        (error?.response?.data as any)?.url ||
        (error as any)?.checkout_url
      if (redirectUrl) {
        console.log(
          '[CollaboratorUpgradePrompt] Redirecting to Stripe checkout:',
          redirectUrl,
        )
        window.location.href = redirectUrl
        return
      }

      if (
        error?.message?.includes('payment') ||
        error?.message?.includes('Payment') ||
        error?.message?.includes('payment_method')
      ) {
        toast.info('Payment method required. Redirecting to billing...')
        router.push('/web/dashboard')
      } else {
        const errorMessage =
          error?.message || error?.data?.message || 'Unknown error'
        toast.error(
          `Failed to upgrade: ${errorMessage}. Redirecting to billing page...`,
        )
        console.error(
          '[CollaboratorUpgradePrompt] Detailed error:',
          errorMessage,
        )
        setTimeout(() => {
          router.push('/web/dashboard')
        }, 1500)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleViewPlans = () => {
    if (onUpgradeClick) {
      onUpgradeClick()
    } else {
      router.push('/web/dashboard')
    }
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card text-card-foreground">
      {/* Content area - expands vertically, container handles scrolling */}
      <div className="p-6">
        {/* Title */}
        <h3 className="mb-2 text-lg font-semibold">
          Get More Team Members with Business Plan
        </h3>

        {/* Message */}
        <p className="mb-4 text-sm text-muted-foreground">
          You've reached your Hobby plan limit of 2 members per project. Upgrade
          to Business plan to add up to 5 members per project.
        </p>

        {/* Price Section */}
        <div className="mb-4 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              {ORIGINAL_PRICES.business && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground line-through">
                    {getFormattedOriginalPrice('business')}
                  </span>
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-700">
                    50% off
                  </span>
                </div>
              )}
              <div className="text-2xl font-bold text-primary">
                {getFormattedPrice('business')}
              </div>
              <div className="text-xs text-muted-foreground">per month</div>
              {ORIGINAL_PRICES.business && (
                <div className="mt-0.5 text-[10px] font-medium text-purple-600">
                  Early user pricing
                </div>
              )}
            </div>
          </div>

          {/* Upgrade Buttons - Right below price */}
          {showUpgradeButton && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={handleQuickUpgrade}
                disabled={isLoading}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Confirm Upgrade'
                )}
              </button>
              <button
                onClick={handleViewPlans}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                View All Plans
              </button>
            </div>
          )}
        </div>

        {/* Comprehensive Feature List */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold">
            Everything you get with Business Plan:
          </h4>

          {allFeatures.map((section) => (
            <div
              key={section.category}
              className="rounded-lg border border-border bg-muted/20 p-3"
            >
              <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.category}
              </h5>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {section.features.map((feature) => (
                  <div
                    key={feature}
                    className="flex items-center gap-2 text-sm"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                    <span className="text-muted-foreground">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Founders note */}
          <div className="rounded-lg border border-purple-200/60 bg-purple-50/50 p-3 text-center">
            <p className="text-xs leading-relaxed text-purple-700">
              💜 We don't profit from subscriptions—your support keeps vly
              alive.{' '}
              <a
                href="https://discord.gg/yXG3w7wxfs"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline hover:text-purple-900"
              >
                Join Discord
              </a>{' '}
              to meet the founders!
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
