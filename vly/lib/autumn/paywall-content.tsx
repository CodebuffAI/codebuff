import { type CheckFeaturePreview } from "autumn-js";

// Map plan IDs to display names
const PLAN_DISPLAY_NAMES: Record<string, string> = {
  free_plan: "Free",
  starter_plan: "Starter",
  hobby_plan: "Hobby",
  business_plan: "Business",
  scale_plan: "Scale",
  priority_plan: "Priority",
  ultra_plan: "Ultra",
  max_plan: "Max",
  unlimited_plan: "Unlimited",
  enterprise_plan: "Enterprise",
  // Legacy mappings
  hobby_custom_plan: "Hobby",
  pro_custom_plan: "Business",
  pro_plan: "Business",
  team_plan: "Scale",
  team_custom_plan: "Scale",
};

// Get display name for a plan
function getPlanDisplayName(planId: string, fallbackName: string): string {
  return PLAN_DISPLAY_NAMES[planId] || fallbackName;
}

export const getPaywallContent = (preview?: CheckFeaturePreview) => {
  if (!preview) {
    return {
      title: "Feature Unavailable",
      message: "This feature is not available for your account.",
    };
  }

  const { scenario, products, feature_name } = preview;

  if (products.length == 0) {
    switch (scenario) {
      case "usage_limit":
        return {
          title: `Feature Unavailable`,
          message: `You have reached the usage limit for ${feature_name}. Please upgrade your plan or purchase a one-time credit pack.`,
        };
      default:
        return {
          title: "Feature Unavailable",
          message:
            "This feature is not available for your account. Please upgrade to a higher tier to enable it.",
        };
    }
  }

  const nextProduct = products[0];
  const planName = getPlanDisplayName(nextProduct.id, nextProduct.name);

  const isAddOn = nextProduct && nextProduct.is_add_on;

  const title = nextProduct.free_trial
    ? `Start trial for ${planName}`
    : nextProduct.is_add_on
      ? `Purchase ${nextProduct.name}`
      : `Upgrade to ${planName}`;

  let message = "";
  if (isAddOn) {
    message = `Please purchase the ${nextProduct.name} add-on to continue using ${feature_name}.`;
  } else {
    message = `Please upgrade to the ${planName} plan to continue building with ${feature_name}.`;
  }

  switch (scenario) {
    case "usage_limit":
      return {
        title: title,
        message: `You have reached the usage limit for ${feature_name}. ${message} Alternatively, you can purchase a one-time $15 credit pack.`,
      };
    case "feature_flag":
      return {
        title: title,
        message: `This feature requires the ${planName} plan or higher. ${message}`,
      };
    default:
      return {
        title: "Feature Unavailable",
        message: "This feature is not available for your account.",
      };
  }
};
