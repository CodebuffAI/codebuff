'use client'

import { PlansPricingSection } from './PlansPricingSection'

interface TabbedBillingPageProps {
  organizationId?: string | null
}

export function TabbedBillingPage(props: TabbedBillingPageProps = {}) {
  return <PlansPricingSection organizationId={props.organizationId} />
}
