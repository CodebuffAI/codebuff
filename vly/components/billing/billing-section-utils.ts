/**
 * Utility functions for BillingSection component
 * Separates business logic from presentation
 */

import {
  freePlan,
  starterPlan,
  hobbyPlan,
  businessPlan,
  scalePlan,
  priorityPlan,
  ultraPlan,
  maxPlan,
  unlimitedPlan,
  enterprisePlan,
} from "@/autumn.config";
import type { CustomerFeature } from "@/lib/billing/types";

/**
 * Get product details based on context (organization vs individual)
 */
export function getProductDetails(isOrganizationContext: boolean) {
  return isOrganizationContext
    ? [{ id: scalePlan.id }, { id: enterprisePlan.id }]
    : [
        { id: freePlan.id },
        { id: starterPlan.id },
        { id: hobbyPlan.id },
        { id: businessPlan.id },
        { id: scalePlan.id },
        // Hidden tiers - shown in collapsible section
        { id: priorityPlan.id },
        { id: ultraPlan.id },
        { id: maxPlan.id },
        { id: unlimitedPlan.id },
      ];
}

/**
 * Configuration for Convex usage accordion
 */
export function getConvexFeatures(features: {
  convexFunctionCalls?: CustomerFeature;
  convexCompute?: CustomerFeature;
  convexDatabaseBW?: CustomerFeature;
  convexFileBW?: CustomerFeature;
}) {
  return [
    {
      featureId: "convex_function_calls",
      feature: features.convexFunctionCalls,
    },
    {
      featureId: "convex_compute",
      feature: features.convexCompute,
    },
    {
      featureId: "convex_database_bw",
      feature: features.convexDatabaseBW,
    },
    {
      featureId: "convex_file_bw",
      feature: features.convexFileBW,
    },
  ];
}

/**
 * Configuration for Integration usage accordion
 */
export function getIntegrationFeatures(features: {
  emailIntegration?: CustomerFeature;
  llmIntegration?: CustomerFeature;
}) {
  return [
    {
      featureId: "email_integration",
      feature: features.emailIntegration,
    },
    {
      featureId: "llm_integration",
      feature: features.llmIntegration,
    },
  ];
}
