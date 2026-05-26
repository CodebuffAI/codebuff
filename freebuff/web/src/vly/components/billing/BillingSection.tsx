'use client'

import { useCustomer, usePricingTable } from 'autumn-js/react'
import { lazy, Suspense } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const PricingTable = lazy(() => import('@/vly/components/autumn/pricing-table'))
import CheckoutDialog from '@/vly/components/autumn/checkout-dialog'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { freePlan, hobbyPlan, scalePlan } from '@/vly/autumn.config'
import { Accordion } from '@/vly/components/ui/accordion'
import { BillingSectionSkeleton } from './BillingSkeleton'
import { useConfetti } from '@/vly/hooks/use-confetti'
import { useFeatureFlag } from '@/vly/hooks/useFeatureFlag'
import { usePaymentActions } from '@/vly/hooks/usePaymentActions'
import { usePaymentSuccessHandling } from '@/vly/hooks/usePaymentSuccessHandling'
import { useDirectPlanCheckout } from '@/vly/hooks/useDirectPlanCheckout'
import { UsageAccordion } from './UsageAccordion'
import { SandboxSpecsAccordion } from './SandboxSpecsAccordion'
import { GitHubSyncAccordion } from './GitHubSyncAccordion'
import { SeatsDisplay } from './SeatsDisplay'
import { UsageActivityPanel } from './UsageActivityPanel'
import { CompactReferralButton } from './CompactReferralButton'
import { PlanHeaderCard } from './PlanHeaderCard'
import { PlanCard } from './PlanCard'
import { CreditsAndReferralRow } from './CreditsAndReferralRow'
import { PricingTableSkeleton } from './PricingTableSkeleton'
import { ConvexIcon, IntegrationIcon } from './icons'
import { PaymentMethodDisplay } from './PaymentMethodDisplay'
import { TopUpButton } from './TopUpButton'
import { CreditsDisplay } from './CreditsDisplay'
import { CreditPacksSection } from './CreditPacksSection'
import {
  getProductDetails,
  getConvexFeatures,
  getIntegrationFeatures,
} from './billing-section-utils'
import {
  calculateGroupOverageCost,
  calculateGroupAverageUsage,
  calculateGroupMaxUsage,
  extractCustomerFeatures,
  calculateCreditPercentage,
  getActivePlan,
} from '@/vly/lib/billing'

interface BillingSectionProps {
  organizationId?: string // Keep for UI display logic only
  showPlans?: boolean // Control whether to show the pricing table section
}

export function BillingSection({
  organizationId,
  showPlans = true,
}: BillingSectionProps = {}) {
  // Autumn automatically detects organization context from Clerk's JWT token
  // via the identify function in autumn.ts
  const { openBillingPortal, customer } = useCustomer({
    expand: ['payment_method'],
  })

  const { fireSuccess } = useConfetti()

  // Feature flags
  // VLY integrations and referrals are always enabled
  const vlyIntegrationsEnabled = true
  const referralsEnabled = true
  const { enabled: organizationsEnabled } = useFeatureFlag(
    'organizations_enabled',
  )

  // Check if we're in organization context (only if feature is enabled)
  const isOrganizationContext = organizationsEnabled && !!organizationId

  // Payment actions hook (setup/update payment method)
  const { loadingStates, handleSetupPayment, handleUpdatePaymentMethod } =
    usePaymentActions()
  const { directPlanCheckout, isDirectPlanCheckoutLoading } =
    useDirectPlanCheckout()

  // Handle payment success URL parameters
  usePaymentSuccessHandling({
    onPaymentSetupSuccess: fireSuccess,
    onPaymentUpdateSuccess: fireSuccess,
  })

  // Get plan data using same source as pricing table
  const productDetails = getProductDetails(isOrganizationContext)
  usePricingTable({ productDetails })

  // Referral data (skip if feature is disabled or in organization context)
  const shouldLoadReferrals =
    referralsEnabled && !isOrganizationContext && organizationsEnabled !== false
  const userCodes = useQuery(
    api.referrals.getUserReferralCodes,
    shouldLoadReferrals ? {} : 'skip',
  )
  const earnCreditEvents = useQuery(
    api.earn.getEarnCreditActivity,
    shouldLoadReferrals ? {} : 'skip',
  )
  const createCode = useMutation(api.referrals.createReferralCode)
  const primaryCode = userCodes?.[0]

  const handleManageBilling = async () => {
    await openBillingPortal({
      returnUrl: `${window.location.origin}/web/dashboard`,
    })
  }

  const handleQuickUpgradeClick = async () => {
    await directPlanCheckout({
      productId: hobbyPlan.id,
      productName: hobbyPlan.name,
      isSubscriptionUpgrade: true,
    })
  }

  if (!customer) {
    return <BillingSectionSkeleton />
  }

  // Get current plan using centralized logic
  const defaultPlanId = isOrganizationContext ? scalePlan.id : freePlan.id
  const { planId: actualPlan, displayName: displayPlan } = getActivePlan(
    customer?.products,
    customer,
    defaultPlanId,
  )

  // Extract all customer features with type safety
  const features = extractCustomerFeatures(customer)

  // Get actual credit data from Autumn customer features
  const actualCredits =
    features.agent_credits?.unlimited === true ||
    features.agent_credits?.included_usage === 'inf'
      ? Number.MAX_SAFE_INTEGER
      : features.agent_credits?.included_usage || 0
  const actualCreditsRemaining = features.agent_credits?.balance || 0

  // Get seats data for organization billing
  const includedSeats =
    features.seats?.unlimited === true ||
    features.seats?.included_usage === 'inf'
      ? Number.MAX_SAFE_INTEGER
      : features.seats?.included_usage || 0
  const usedSeats = features.seats?.usage || 0

  // Calculate credit usage percentage
  const creditPercentage = calculateCreditPercentage(
    actualCredits,
    actualCreditsRemaining,
  )

  // Consolidated feature arrays (React Compiler handles memoization)
  const convexFeatures = getConvexFeatures(features)
  const integrationFeatures = getIntegrationFeatures(features)

  return (
    <div className="space-y-6">
      {/* Top section with Your Plan and Add-ons side by side */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Current Plan Status - Takes up 2 columns on larger screens */}
        <PlanCard
          header={
            <PlanHeaderCard
              title={isOrganizationContext ? 'Organization Plan' : 'Your Plan'}
              subtitle={
                isOrganizationContext
                  ? 'Team billing and seat management'
                  : 'Current usage and billing management'
              }
              badge={displayPlan}
            />
          }
          footer={
            <PaymentMethodDisplay
              paymentMethod={customer?.payment_method}
              isFreePlan={actualPlan === freePlan.id}
              loadingStates={{
                ...loadingStates,
                upgrade: isDirectPlanCheckoutLoading,
              }}
              onManageBilling={handleManageBilling}
              onSetupPayment={handleSetupPayment}
              onUpdatePayment={handleUpdatePaymentMethod}
              onQuickUpgrade={handleQuickUpgradeClick}
              upgradePlanName={hobbyPlan.name}
            />
          }
        >
          {/* Credits Display */}
          <>
            {/* Team Seats - Only show for organization context */}
            {isOrganizationContext && (
              <SeatsDisplay
                includedSeats={includedSeats}
                usedSeats={usedSeats}
              />
            )}

            {/* Agent Credits and Referral Section */}
            <CreditsAndReferralRow
              credits={
                <motion.div
                  layout
                  transition={{
                    duration: 0.3,
                    ease: [0.4, 0, 0.2, 1] as const,
                  }}
                  className="flex-1"
                >
                  <CreditsDisplay
                    actualCredits={actualCredits}
                    actualCreditsRemaining={actualCreditsRemaining}
                    creditPercentage={creditPercentage}
                    isOrganizationContext={isOrganizationContext}
                  />
                </motion.div>
              }
              referral={
                <AnimatePresence mode="wait">
                  {referralsEnabled && !isOrganizationContext && (
                    <motion.div
                      key="referral-button"
                      layout
                      initial={{ opacity: 0, scale: 0.95, width: 0 }}
                      animate={{ opacity: 1, scale: 1, width: 'auto' }}
                      exit={{ opacity: 0, scale: 0.95, width: 0 }}
                      transition={{
                        duration: 0.3,
                        ease: [0.4, 0, 0.2, 1] as const,
                        opacity: { duration: 0.15, delay: 0.1 },
                      }}
                      className="overflow-hidden"
                    >
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{
                          opacity: {
                            duration: 0.1,
                            delay: 0.2,
                            ease: [0.4, 0, 0.2, 1] as const,
                          },
                        }}
                        className="whitespace-nowrap"
                      >
                        <CompactReferralButton
                          primaryCode={primaryCode}
                          onCreateCode={async () => {
                            const result = await createCode({})
                            fireSuccess()
                            return result
                          }}
                        />
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              }
            />

            {/* Convex Usage Section */}
            <Accordion type="multiple" className="w-full">
              <UsageAccordion
                value="convex"
                title="Convex Usage"
                description="Backend resources powering your projects. Includes database queries, compute time, and bandwidth."
                icon={<ConvexIcon />}
                features={convexFeatures}
                calculateCost={calculateGroupOverageCost}
                calculateAverage={calculateGroupMaxUsage}
                TopUpButton={TopUpButton}
                checkoutDialog={CheckoutDialog}
              />
            </Accordion>

            {/* Integration Usage Section - Only show if vly_integrations_enabled flag is on */}
            {vlyIntegrationsEnabled && (
              <Accordion type="multiple" className="w-full">
                <UsageAccordion
                  value="integrations"
                  title="Integration Usage"
                  description="Email and AI quotas for sending emails and AI-powered features. Used for special services in your apps."
                  icon={<IntegrationIcon />}
                  features={integrationFeatures}
                  calculateCost={calculateGroupOverageCost}
                  calculateAverage={calculateGroupAverageUsage}
                  TopUpButton={TopUpButton}
                  checkoutDialog={CheckoutDialog}
                />
              </Accordion>
            )}

            {/* Workspace Specifications */}
            <Accordion type="multiple" className="w-full">
              <SandboxSpecsAccordion
                isOrganizationContext={isOrganizationContext}
                organizationId={organizationId}
              />
            </Accordion>

            {/* GitHub Sync Usage */}
            <Accordion type="multiple" className="w-full">
              <GitHubSyncAccordion />
            </Accordion>

            {/* Credit Packs Section */}
            <div className="mt-4 border-t pt-4">
              <CreditPacksSection />
            </div>
          </>
        </PlanCard>

        {/* Usage Activity Section - Takes up 1 column on larger screens */}
        <UsageActivityPanel
          customer={customer}
          vlyIntegrationsEnabled={vlyIntegrationsEnabled}
          earnCreditEvents={earnCreditEvents ?? []}
        />
      </div>

      {/* Autumn Pricing Table - only plans, add-ons handled above */}
      {showPlans && (
        <Suspense fallback={<PricingTableSkeleton />}>
          <PricingTable showOnlyPlans={true} productDetails={productDetails} />
        </Suspense>
      )}
    </div>
  )
}
