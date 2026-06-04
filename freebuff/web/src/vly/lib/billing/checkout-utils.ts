import type { Product } from "autumn-js";

export type DirectPlanCheckoutFn = (opts: {
  productId: string;
  productName?: string;
  successUrl?: string;
  isSubscriptionUpgrade?: boolean;
}) => Promise<void>;

/**
 * Handles product checkout with Autumn billing
 * Supports both direct checkout and external button URLs
 * Uses fixed tier pricing - each plan has a set price and credit amount
 */
export async function handleProductCheckout(params: {
  product: Product;
  customer: any;
  checkout: (options: {
    productId: string;
    dialog: any;
    options: Array<{ featureId: string; quantity: number }>;
  }) => Promise<any>;
  checkoutDialog: any;
}) {
  const { product, customer, checkout, checkoutDialog } = params;

  if (product.id && customer) {
    const checkoutOptions: {
      productId: string;
      dialog: any;
      options: Array<{ featureId: string; quantity: number }>;
    } = {
      productId: product.id,
      dialog: checkoutDialog,
      options: [], // Always provide options array to force Autumn to show dialog
    };

    await checkout(checkoutOptions);
  } else if (product.display?.button_url) {
    window.open(product.display?.button_url, "_blank");
  }
}

/**
 * Creates a checkout handler function for a specific product
 * Useful for onClick handlers in pricing cards
 */
export function createCheckoutHandler(params: {
  product: Product;
  customer: any;
  checkout: (options: {
    productId: string;
    dialog: any;
    options: Array<{ featureId: string; quantity: number }>;
  }) => Promise<any>;
  checkoutDialog: any;
  isSignedIn?: boolean;
  onRequireLogin?: () => void;
}) {
  return async () => {
    // Check if user is signed in before proceeding with checkout
    if (params.isSignedIn === false && params.onRequireLogin) {
      params.onRequireLogin();
      return;
    }

    // If customer is null and user is not signed in, require login
    if (
      !params.customer &&
      params.isSignedIn === false &&
      params.onRequireLogin
    ) {
      params.onRequireLogin();
      return;
    }

    await handleProductCheckout(params);
  };
}

/**
 * One-click direct plan checkout (no pricing popup).
 * Redirects to Stripe checkout when payment is needed; otherwise attach
 * in-place, grant bonus credits, and refetch.
 */
export async function handleDirectPlanCheckout(params: {
  product: Product;
  customer: any;
  directPlanCheckout: DirectPlanCheckoutFn;
}) {
  const { product, customer, directPlanCheckout } = params;

  if (!customer) return;

  if (product.display?.button_url) {
    window.open(product.display?.button_url, "_blank");
    return;
  }

  if (product.id) {
    await directPlanCheckout({
      productId: product.id,
      productName: product.name ?? undefined,
      isSubscriptionUpgrade: !product.properties?.is_one_off,
    });
  }
}

/**
 * Creates a one-click direct plan checkout handler for pricing cards.
 * No popup – attach immediately or redirect to Stripe.
 */
export function createDirectPlanCheckoutHandler(params: {
  product: Product;
  customer: any;
  directPlanCheckout: DirectPlanCheckoutFn;
}) {
  return async () => {
    await handleDirectPlanCheckout(params);
  };
}
