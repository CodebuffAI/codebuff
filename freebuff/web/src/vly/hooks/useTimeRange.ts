import { useState, useMemo } from "react";
import type { TimeRange } from "@/vly/lib/monitoring/monitoring-types";
import type { Customer } from "autumn-js";

interface UseTimeRangeOptions {
  customer?: Customer | null;
}

export function useTimeRange(
  initialRange: TimeRange = "24h",
  options?: UseTimeRangeOptions,
) {
  const [timeRange, setTimeRange] = useState<TimeRange>(initialRange);
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  const timeRangeValues = useMemo(() => {
    const now = new Date();
    let startTime: string;
    let endTime = now.toISOString();

    switch (timeRange) {
      case "billing_cycle": {
        // Get billing cycle start from customer's current product subscription
        // This provides the exact monthly billing period (not a fixed 30-day period)
        const currentPeriodStart =
          options?.customer?.products?.[0]?.current_period_start;

        if (currentPeriodStart) {
          // current_period_start is already in milliseconds
          startTime = new Date(currentPeriodStart).toISOString();

          // End time is now (to show usage up to this moment)
          endTime = now.toISOString();
        } else {
          // Fallback to last 24 hours if billing data not available
          startTime = new Date(
            now.getTime() - 24 * 60 * 60 * 1000,
          ).toISOString();
        }
        break;
      }
      case "5m":
        startTime = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
        break;
      case "1h":
        startTime = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
        break;
      case "24h":
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        break;
      case "7d":
        startTime = new Date(
          now.getTime() - 7 * 24 * 60 * 60 * 1000,
        ).toISOString();
        break;
      case "custom":
        if (!customStartDate || !customEndDate) return null;
        startTime = new Date(customStartDate).toISOString();
        endTime = new Date(customEndDate).toISOString();
        break;
    }

    return { startTime, endTime };
  }, [timeRange, customStartDate, customEndDate, options?.customer]);

  return {
    timeRange,
    setTimeRange,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    timeRangeValues,
  };
}
