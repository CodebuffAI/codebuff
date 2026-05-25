/**
 * Centralized product configuration system
 * Maps product IDs to their display metadata, icons, and styling
 * Also includes product filtering and organization utilities
 */

import {
  EmailIcon,
  AIIcon,
  ConvexFunctionCallsIcon,
  ConvexComputeIcon,
  ConvexDatabaseIcon,
  ConvexFileIcon,
} from "@/components/billing/icons";
import { VlyCoin } from "@/components/ui/vly-coin";
import type { Product } from "autumn-js";

export interface ProductIconConfig {
  icon: React.ComponentType<{ size?: "sm" | "md" | "lg" }>;
  colorClasses: string; // Text color classes for product name
  buttonHoverClasses?: string; // Optional button hover classes
}

/**
 * Product icon and styling configuration
 * Used for add-on packs and credit products
 */
export const PRODUCT_ICON_CONFIG: Record<string, ProductIconConfig> = {
  // Agent Credit Packs
  token_pack: {
    icon: VlyCoin,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  token_pack_small: {
    icon: VlyCoin,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  token_pack_medium: {
    icon: VlyCoin,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  token_pack_large: {
    icon: VlyCoin,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },

  // Credit Packs (one-time and recurring)
  one_time_credit_pack: {
    icon: VlyCoin,
    colorClasses: "text-amber-700",
    buttonHoverClasses:
      "hover:border-amber-300/60 hover:bg-amber-100/60 hover:text-amber-900",
  },
  recurring_credit_pack: {
    icon: VlyCoin,
    colorClasses: "text-green-700",
    buttonHoverClasses:
      "hover:border-green-300/60 hover:bg-green-100/60 hover:text-green-900",
  },

  // Email Packs
  email_pack: {
    icon: EmailIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  email_pack_small: {
    icon: EmailIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  email_pack_medium: {
    icon: EmailIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  email_pack_large: {
    icon: EmailIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },

  // AI Packs
  ai_pack: {
    icon: AIIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  ai_pack_small: {
    icon: AIIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  ai_pack_medium: {
    icon: AIIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  ai_pack_large: {
    icon: AIIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },

  // Convex Function Calls Packs
  convex_function_calls_pack: {
    icon: ConvexFunctionCallsIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  convex_function_calls_pack_small: {
    icon: ConvexFunctionCallsIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  convex_function_calls_pack_medium: {
    icon: ConvexFunctionCallsIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  convex_function_calls_pack_large: {
    icon: ConvexFunctionCallsIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },

  // Convex Compute Packs
  convex_compute_pack: {
    icon: ConvexComputeIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  convex_compute_pack_small: {
    icon: ConvexComputeIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  convex_compute_pack_medium: {
    icon: ConvexComputeIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  convex_compute_pack_large: {
    icon: ConvexComputeIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },

  // Convex Database BW Packs
  convex_database_bw_pack: {
    icon: ConvexDatabaseIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  convex_database_bw_pack_small: {
    icon: ConvexDatabaseIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  convex_database_bw_pack_medium: {
    icon: ConvexDatabaseIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  convex_database_bw_pack_large: {
    icon: ConvexDatabaseIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },

  // Convex File BW Packs
  convex_file_bw_pack: {
    icon: ConvexFileIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  convex_file_bw_pack_small: {
    icon: ConvexFileIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  convex_file_bw_pack_medium: {
    icon: ConvexFileIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
  convex_file_bw_pack_large: {
    icon: ConvexFileIcon,
    colorClasses: "text-purple-700",
    buttonHoverClasses:
      "hover:border-purple-300/60 hover:bg-purple-100/60 hover:text-purple-900",
  },
};

/**
 * Get icon component for a product ID
 * Falls back to VlyCoin for unknown products
 */
export function getProductIcon(
  productId: string,
): React.ComponentType<{ size?: "sm" | "md" | "lg" }> {
  const config = PRODUCT_ICON_CONFIG[productId];
  return config?.icon ?? VlyCoin;
}

/**
 * Get color classes for a product ID's name/title
 * Falls back to default zinc-700 for unknown products
 */
export function getProductColorClasses(productId: string): string {
  const config = PRODUCT_ICON_CONFIG[productId];
  return config?.colorClasses ?? "text-zinc-700";
}

/**
 * Get button hover classes for a product ID
 * Returns empty string if no special hover classes defined
 */
export function getProductButtonHoverClasses(productId: string): string {
  const config = PRODUCT_ICON_CONFIG[productId];
  return config?.buttonHoverClasses ?? "";
}

/**
 * Check if a product ID is a known add-on pack
 */
export function isKnownPackProduct(productId: string): boolean {
  return productId in PRODUCT_ICON_CONFIG;
}

// ============================================================================
// Product Filtering & Organization Utilities
// ============================================================================

/**
 * Filter products by billing interval (monthly/annual)
 * Used for interval toggle in pricing tables
 */
export function filterProductsByInterval(
  products: Product[] | undefined | null,
  isAnnual: boolean,
  multiInterval: boolean,
): Product[] {
  if (!products) return [];

  const intervalFilter = (product: Product) => {
    if (!product.properties?.interval_group) {
      return true;
    }

    if (multiInterval) {
      if (isAnnual) {
        return product.properties?.interval_group === "year";
      } else {
        return product.properties?.interval_group === "month";
      }
    }

    return true;
  };

  return products.filter(intervalFilter);
}

/**
 * Separate products into plans and add-ons
 * Plans are primary subscriptions, add-ons are optional extras
 */
export function separateProductsByType(products: Product[]) {
  return {
    plans: products.filter((product) => !product.is_add_on),
    addOns: products.filter((product) => product.is_add_on),
  };
}
