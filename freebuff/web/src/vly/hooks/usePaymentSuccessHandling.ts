/**
 * Custom hook for handling payment success URL parameters
 * Manages toast notifications and URL cleanup after payment flows
 */

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

interface UsePaymentSuccessHandlingOptions {
  onPaymentSetupSuccess?: () => void;
  onPaymentUpdateSuccess?: () => void;
}

export function usePaymentSuccessHandling(
  options: UsePaymentSuccessHandlingOptions = {},
) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const paymentSetup = searchParams.get("payment_setup");
    const paymentUpdated = searchParams.get("payment_updated");

    if (paymentSetup === "success") {
      toast.success("Payment method set up successfully!");
      options.onPaymentSetupSuccess?.();

      // Clean up URL by removing the parameter
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("payment_setup");
      router.replace(newUrl.pathname + newUrl.search);
    }

    if (paymentUpdated === "success") {
      toast.success("Payment method updated successfully!");
      options.onPaymentUpdateSuccess?.();

      // Clean up URL by removing the parameter
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("payment_updated");
      router.replace(newUrl.pathname + newUrl.search);
    }
  }, [searchParams, router, options]);
}
