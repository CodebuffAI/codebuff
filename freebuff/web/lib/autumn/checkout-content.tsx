import { type CheckoutResult } from "autumn-js";

export const getCheckoutContent = (checkoutResult: CheckoutResult) => {
  const { product, current_product, next_cycle } = checkoutResult;
  const { is_one_off, is_free, has_trial, updateable } = product.properties;
  const scenario = product.scenario;

  const nextCycleAtStr = next_cycle
    ? new Date(next_cycle.starts_at).toLocaleDateString()
    : undefined;

  // For custom plan, show a more descriptive name based on selected credits
  const isCustomPlan = product.id === "custom_plan";
  const productName = isCustomPlan ? "Custom Plan" : product.name;

  if (is_one_off) {
    return {
      title: <p>Purchase {productName}</p>,
      message: (
        <p>
          By clicking confirm, you will purchase {productName} and your card
          will be charged immediately.
        </p>
      ),
    };
  }

  if (scenario == "active" && updateable) {
    if (updateable) {
      return {
        title: <p>Update Plan</p>,
        message: (
          <p>
            Update your prepaid quantity. You&apos;ll be charged or credited the
            prorated difference based on your current billing cycle.
          </p>
        ),
      };
    }
  }

  if (has_trial) {
    return {
      title: <p>Start trial for {productName}</p>,
      message: (
        <p>
          By clicking confirm, you will start a free trial of {productName}{" "}
          which ends on {nextCycleAtStr}.
        </p>
      ),
    };
  }

  switch (scenario) {
    case "scheduled":
      return {
        title: <p>{productName} product already scheduled</p>,
        message: (
          <p>
            You are currently on product {current_product.name} and are
            scheduled to start {productName} on {nextCycleAtStr}.
          </p>
        ),
      };

    case "active":
      return {
        title: <p>Product already active</p>,
        message: <p>You are already subscribed to this product.</p>,
      };

    case "new":
      if (is_free) {
        return {
          title: <p>Enable {productName}</p>,
          message: (
            <p>
              By clicking confirm, {productName} will be enabled immediately.
            </p>
          ),
        };
      }

      return {
        title: <p>Subscribe to {productName}</p>,
        message: (
          <p>
            By clicking confirm, you will be subscribed to {productName} and
            your card will be charged immediately.
          </p>
        ),
      };
    case "renew":
      return {
        title: <p>Renew</p>,
        message: (
          <p>
            By clicking confirm, you will renew your subscription to{" "}
            {productName}.
          </p>
        ),
      };

    case "upgrade":
      return {
        title: <p>Upgrade to {productName}</p>,
        message: (
          <p>
            By clicking confirm, you will upgrade to {productName} and your
            payment method will be charged immediately.
          </p>
        ),
      };

    case "downgrade":
      return {
        title: <p>Downgrade to {productName}</p>,
        message: (
          <p>
            By clicking confirm, your current subscription to{" "}
            {current_product.name} will be cancelled and a new subscription to{" "}
            {productName} will begin on {nextCycleAtStr}.
          </p>
        ),
      };

    case "cancel":
      return {
        title: <p>Cancel</p>,
        message: (
          <p>
            By clicking confirm, your subscription to {current_product.name}{" "}
            will end on {nextCycleAtStr}.
          </p>
        ),
      };

    default:
      return {
        title: <p>Change Subscription</p>,
        message: <p>You are about to change your subscription.</p>,
      };
  }
};
