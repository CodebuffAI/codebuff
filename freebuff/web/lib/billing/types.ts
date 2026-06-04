/**
 * Shared TypeScript types for billing system
 *
 * This is the SINGLE SOURCE OF TRUTH for billing-related types.
 * All billing files should import types from here instead of defining their own.
 *
 * Type Categories:
 * - Product types: ProductIconConfig
 * - Customer types: AutumnCustomer, CustomerProduct, PaymentMethod, CustomerFeature, BooleanFeature
 * - Usage types: UsageActivity, UsageColorScheme, UsageMetric
 * - Billing types: PlanConfig, OverageResult, CheckoutHandlerParams
 *
 * Note: PackOption and FeatureConfig are defined in feature-config.ts
 */

import type { LucideIcon } from "lucide-react";
import type { Product } from "autumn-js";

/**
 * Product icon and styling configuration
 */
export interface ProductIconConfig {
  icon: React.ComponentType<{ size?: "sm" | "md" | "lg" }>;
  colorClasses: string;
  buttonHoverClasses?: string;
}

/**
 * Usage activity entry for display
 */
export interface UsageActivity {
  featureId: string;
  featureName: string;
  usage: number;
  balance: number;
  icon: LucideIcon;
}

/**
 * Customer feature data from Autumn
 */
export interface CustomerFeature {
  usage?: number;
  balance?: number | null; // null allowed to match Autumn API responses
  included_usage?: number | "inf"; // "inf" represents unlimited usage
  unlimited?: boolean; // Alternative way Autumn API indicates unlimited
  next_reset_at?: number;
}

/**
 * Autumn payment method data
 */
export interface PaymentMethod {
  card?: {
    brand?: string;
    last4?: string;
    exp_month?: number;
    exp_year?: number;
  };
}

/**
 * Autumn product subscription data
 */
export interface CustomerProduct {
  id: string;
  name?: string | null;
  group?: string | null;
  status?: string;
  scenario?: string;
  is_add_on?: boolean;
  canceled_at?: number | null;
  started_at?: number;
  current_period_start?: number | null;
  current_period_end?: number | null;
  items?: Array<{
    feature_id?: string;
    included_usage?: number | "inf";
  }>;
}

/**
 * Boolean feature data from Autumn (for boolean-type features like GitHub integration)
 */
export interface BooleanFeature {
  has_access?: boolean;
}

/**
 * Autumn customer object with typed features
 * Extended to support all tier features from autumn/constants.ts
 */
export interface AutumnCustomer {
  id: string | null;
  payment_method?: PaymentMethod | null;
  products?: CustomerProduct[];
  features?: {
    // Usage-based features
    agent_credits?: CustomerFeature;
    email_integration?: CustomerFeature;
    llm_integration?: CustomerFeature;
    convex_function_calls?: CustomerFeature;
    convex_compute?: CustomerFeature;
    convex_database_bw?: CustomerFeature;
    convex_file_bw?: CustomerFeature;
    seats?: CustomerFeature;

    // Starter tier boolean features
    documentation_visualizer?: BooleanFeature;
    database_preview?: BooleanFeature;
    no_vlyai_branding?: BooleanFeature;
    custom_domains?: BooleanFeature;

    // Hobby tier boolean features
    team_collaboration?: BooleanFeature;
    integrations_library?: BooleanFeature;
    project_code_editor?: BooleanFeature;
    agent_context_length?: BooleanFeature;

    // Business tier boolean features
    github_integration?: BooleanFeature;
    convex_logs?: BooleanFeature;
    cli_agent_access?: BooleanFeature;
    in_app_support?: BooleanFeature;
    private_projects?: BooleanFeature;

    // Scale tier boolean features
    claude_opus_access?: BooleanFeature;
    ui_components_library?: BooleanFeature;
    theme_customization?: BooleanFeature;
    data_transfer?: BooleanFeature;

    // Priority tier boolean features
    personal_phone_support?: BooleanFeature;

    // Max tier boolean features
    hire_developers?: BooleanFeature;
    unlimited_projects?: BooleanFeature;

    // Sandbox features
    sandbox_small?: CustomerFeature;
    sandbox_medium?: CustomerFeature;
    sandbox_large?: CustomerFeature;

    // Team features
    total_members?: CustomerFeature;

    // Legacy - kept for backwards compatibility
    members_per_project?: CustomerFeature;

    // Legacy features (for backwards compatibility)
    abstraction_document?: BooleanFeature;
    convex_database?: BooleanFeature;
    integrations_access?: BooleanFeature;
  };
}

/**
 * Usage color scheme for visual feedback
 */
export interface UsageColorScheme {
  text: string;
  bg: string;
}

/**
 * Plan configuration
 */
export interface PlanConfig {
  id: string;
  name: string;
  displayName?: string;
}

/**
 * Overage calculation result
 */
export interface OverageResult {
  featureId: string;
  overageAmount: number;
  cost: number;
}

/**
 * Metrics for usage calculation
 */
export interface UsageMetric {
  usage: number;
  includedUsage: number;
}

/**
 * Billing section props
 */
export interface BillingSectionProps {
  organizationId?: string;
}

/**
 * Checkout handler params
 */
export interface CheckoutHandlerParams {
  product: Product;
  customer: any;
  checkout: (options: { productId: string; dialog: any }) => Promise<any>;
  checkoutDialog: any;
}
