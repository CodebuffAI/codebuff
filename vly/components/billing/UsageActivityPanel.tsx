/**
 * Usage Activity Panel Component
 * Displays recent usage events timeline using Autumn analytics
 */

import {
  Activity,
  ChevronDown,
  SlidersHorizontal,
  Unplug,
  ArrowUp,
  ArrowDown,
  Award,
  Gift,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAnalytics } from "autumn-js/react";
import {
  FEATURE_CONFIG,
  formatFeatureValue,
  getFeatureUnit,
} from "@/lib/billing/feature-config";
import type { AutumnCustomer } from "@/lib/billing/types";
import { ConvexIcon, TokenIcon } from "@/components/billing/icons";
import { AnimatePresence, motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface UsageActivityPanelProps {
  /** Autumn customer object with feature usage data */
  customer: AutumnCustomer;
  /** Whether vly integrations feature flag is enabled */
  vlyIntegrationsEnabled: boolean;
  /** Custom earn-related credit grants (bounties/referral spins) */
  earnCreditEvents?: EarnCreditEvent[];
}

type TimeRange = "24h" | "7d" | "30d" | "90d" | "last_cycle";

interface UsageMetric {
  featureId: string;
  featureName: string;
  amount: number;
  icon: React.ComponentType<{ className?: string }>;
}

interface UsageEvent {
  timestamp: number;
  featureId: string;
  featureName: string;
  amount: number;
  icon: React.ComponentType<{ className?: string }>;
  // For purchase events
  isPurchase?: boolean;
  productName?: string | null;
  // For custom earn credit grants
  isEarnCredit?: boolean;
  // For grouped events (Convex or Integrations)
  isGrouped?: boolean;
  groupType?: "convex" | "integration";
  metrics?: UsageMetric[];
}

interface EarnCreditEvent {
  id: string;
  timestamp: number;
  amount: number;
  featureId: "agent_credits";
  source: "bounty" | "referral_spin";
  title: string;
  subtitle: string;
}

interface EventGroup {
  timestamp: number;
  events: UsageEvent[];
}

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "last_cycle", label: "Current billing cycle" },
];

export function UsageActivityPanel({
  customer,
  vlyIntegrationsEnabled,
  earnCreditEvents = [],
}: UsageActivityPanelProps) {
  const [selectedRange, setSelectedRange] = useState<TimeRange>("last_cycle");
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [gradientOpacity, setGradientOpacity] = useState(1);
  const [currentTime] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Get all feature IDs, filtering out integrations if flag is disabled
  const featureIds = useMemo(() => {
    return Object.keys(FEATURE_CONFIG).filter((featureId) => {
      if (!vlyIntegrationsEnabled) {
        return (
          featureId !== "email_integration" && featureId !== "llm_integration"
        );
      }
      return true;
    });
  }, [vlyIntegrationsEnabled]);

  // Group Convex features and Integration features
  const convexFeatureIds = useMemo(
    () => featureIds.filter((id) => id.startsWith("convex_")),
    [featureIds],
  );
  const integrationFeatureIds = useMemo(
    () =>
      featureIds.filter(
        (id) => id !== "agent_credits" && !id.startsWith("convex_"),
      ),
    [featureIds],
  );
  const nonConvexFeatureIds = useMemo(
    () => featureIds.filter((id) => !id.startsWith("convex_")),
    [featureIds],
  );

  // State for selected features (default to all) - initialize with featureIds
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(() =>
    Object.keys(FEATURE_CONFIG).filter((featureId) => {
      if (!vlyIntegrationsEnabled) {
        return (
          featureId !== "email_integration" && featureId !== "llm_integration"
        );
      }
      return true;
    }),
  );

  // State for event type filter (incoming/outgoing)
  type EventType = "incoming" | "outgoing";
  const [selectedEventTypes, setSelectedEventTypes] = useState<EventType[]>([
    "incoming",
    "outgoing",
  ]);

  // Filter to valid features during render - no effect needed!
  const validSelectedFeatures = selectedFeatures.filter((id) =>
    featureIds.includes(id),
  );

  const toggleFeature = (featureId: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(featureId)
        ? prev.filter((id) => id !== featureId)
        : [...prev, featureId],
    );
  };

  const toggleConvexGroup = () => {
    const allConvexSelected = convexFeatureIds.every((id) =>
      validSelectedFeatures.includes(id),
    );

    if (allConvexSelected) {
      // Remove all Convex features
      setSelectedFeatures((prev) =>
        prev.filter((id) => !id.startsWith("convex_")),
      );
    } else {
      // Add all Convex features
      setSelectedFeatures((prev) => {
        const withoutConvex = prev.filter((id) => !id.startsWith("convex_"));
        return [...withoutConvex, ...convexFeatureIds];
      });
    }
  };

  const toggleIntegrationGroup = () => {
    const allIntegrationsSelected = integrationFeatureIds.every((id) =>
      validSelectedFeatures.includes(id),
    );

    if (allIntegrationsSelected) {
      // Remove all integration features
      setSelectedFeatures((prev) =>
        prev.filter((id) => id === "agent_credits" || id.startsWith("convex_")),
      );
    } else {
      // Add all integration features
      setSelectedFeatures((prev) => {
        const withoutIntegrations = prev.filter(
          (id) => id === "agent_credits" || id.startsWith("convex_"),
        );
        return [...withoutIntegrations, ...integrationFeatureIds];
      });
    }
  };

  const toggleEventType = (eventType: EventType) => {
    setSelectedEventTypes((prev) =>
      prev.includes(eventType)
        ? prev.filter((type) => type !== eventType)
        : [...prev, eventType],
    );
  };

  // Check if filters will result in no events
  const noFeaturesSelected = validSelectedFeatures.length === 0;
  const noEventTypesSelected = selectedEventTypes.length === 0;

  // Fetch analytics data for selected features only
  // When empty, useAnalytics will return no data (which is what we want for "Clear All")
  const {
    data: analyticsData,
    isLoading,
    error,
  } = useAnalytics({
    featureId: validSelectedFeatures.length > 0 ? validSelectedFeatures : [],
    range: selectedRange,
  });

  // Handle scroll to gradually fade bottom gradient (debounced for performance)
  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const { scrollTop, scrollHeight, clientHeight } = element;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // Fade out gradient over the last 100px of scroll
    const fadeDistance = 100;
    const opacity = Math.min(1, Math.max(0, distanceFromBottom / fadeDistance));

    setGradientOpacity(opacity);
  }, []);

  // Attach scroll listener and check initial state with RAF throttling
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    // Check initial scroll state
    handleScroll();

    // Throttle scroll events using requestAnimationFrame for better performance
    let rafId: number | null = null;
    const throttledScroll = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          handleScroll();
          rafId = null;
        });
      }
    };

    element.addEventListener("scroll", throttledScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", throttledScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [analyticsData, handleScroll]);

  // Transform analytics data into event timeline using useMemo
  // This is the proper React 19 pattern for computed values that depend on props/state
  const eventGroups = useMemo(() => {
    const eventsByTimestamp = new Map<number, UsageEvent[]>();

    if (analyticsData) {
      for (const dataPoint of analyticsData) {
        const { period, ...featureUsages } = dataPoint;

        // Separate features by type
        const convexMetrics: UsageMetric[] = [];
        const integrationMetrics: UsageMetric[] = [];
        const tokenEvent: UsageEvent[] = [];

        for (const [featureId, amount] of Object.entries(featureUsages)) {
          if (typeof amount === "number" && amount > 0) {
            const config = FEATURE_CONFIG[featureId];
            if (config) {
              const metric = {
                featureId,
                featureName: config.name,
                amount,
                icon: config.icon,
              };

              // Check if this is a Convex-related feature
              if (featureId.startsWith("convex_")) {
                convexMetrics.push(metric);
              } else if (featureId === "agent_credits") {
                // Agent Credits (tokens) goes first
                tokenEvent.push({
                  timestamp: period,
                  ...metric,
                  featureName: "Agent Used",
                });
              } else {
                // Other features (integrations)
                integrationMetrics.push(metric);
              }
            }
          }
        }

        // Get or create events array for this timestamp
        if (!eventsByTimestamp.has(period)) {
          eventsByTimestamp.set(period, []);
        }
        const periodEvents = eventsByTimestamp.get(period)!;

        // Add events in order: Agent Credits, Convex Usage, Integration Usage

        // 1. Add Agent Credits first
        periodEvents.push(...tokenEvent);

        // 2. Add grouped Convex event if there are any Convex metrics
        if (convexMetrics.length > 0) {
          // Sort Convex metrics to show Function Calls first
          const sortedConvexMetrics = [...convexMetrics].sort((a, b) => {
            const order = [
              "convex_function_calls",
              "convex_compute",
              "convex_database_bw",
              "convex_file_bw",
            ];
            return order.indexOf(a.featureId) - order.indexOf(b.featureId);
          });

          periodEvents.push({
            timestamp: period,
            featureId: "convex_group",
            featureName: "Convex Used",
            amount: 0, // Not used for grouped events
            icon:
              FEATURE_CONFIG.convex_function_calls?.icon ||
              FEATURE_CONFIG.agent_credits.icon,
            isGrouped: true,
            groupType: "convex",
            metrics: sortedConvexMetrics,
          });
        }

        // 3. Add grouped Integration event if there are any integration metrics
        if (integrationMetrics.length > 0) {
          // Sort integration metrics alphabetically
          const sortedIntegrationMetrics = [...integrationMetrics].sort(
            (a, b) => a.featureName.localeCompare(b.featureName),
          );

          periodEvents.push({
            timestamp: period,
            featureId: "integration_group",
            featureName: "Integrations Used",
            amount: 0, // Not used for grouped events
            icon: Unplug,
            isGrouped: true,
            groupType: "integration",
            metrics: sortedIntegrationMetrics,
          });
        }
      }
    }

    // Generate purchase events from customer products
    if (customer?.products) {
      // Calculate time range boundaries for filtering
      // Use currentTime state to avoid calling impure Date.now() during render
      const now = currentTime;
      let rangeStartTime = 0;

      switch (selectedRange) {
        case "24h":
          rangeStartTime = now - 24 * 60 * 60 * 1000;
          break;
        case "7d":
          rangeStartTime = now - 7 * 24 * 60 * 60 * 1000;
          break;
        case "30d":
          rangeStartTime = now - 30 * 24 * 60 * 60 * 1000;
          break;
        case "90d":
          rangeStartTime = now - 90 * 24 * 60 * 60 * 1000;
          break;
        case "last_cycle":
          // For last_cycle, use current_period_start if available
          const currentPeriodStart =
            customer.products?.[0]?.current_period_start;
          rangeStartTime = currentPeriodStart || now - 30 * 24 * 60 * 60 * 1000;
          break;
      }

      // Get all existing timestamps from analytics data
      const existingTimestamps = Array.from(eventsByTimestamp.keys()).sort(
        (a, b) => a - b,
      );

      for (const product of customer.products) {
        if (!product.started_at || !product.items) continue;

        // Filter to selected time range
        if (product.started_at < rangeStartTime || product.started_at > now) {
          continue;
        }

        // Extract granted features from product.items (filter selected features)
        const grantedMetrics: UsageMetric[] = [];

        for (const item of product.items) {
          if (
            item.feature_id &&
            item.included_usage &&
            item.included_usage !== "inf"
          ) {
            const config = FEATURE_CONFIG[item.feature_id];
            if (!config || !validSelectedFeatures.includes(item.feature_id))
              continue;

            grantedMetrics.push({
              featureId: item.feature_id,
              featureName: config.name,
              amount: item.included_usage,
              icon: config.icon,
            });
          }
        }

        // Only create a purchase event if there are granted metrics to show
        if (grantedMetrics.length > 0) {
          // Store started_at for type safety
          const purchaseTimestamp = product.started_at!; // Safe because we checked above

          // Find the closest existing bucket or create a new one
          let targetTimestamp = purchaseTimestamp;

          if (existingTimestamps.length > 0) {
            // For 24h range, find bucket within 1 hour
            // For other ranges, find bucket on the same day
            const tolerance =
              selectedRange === "24h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

            // Find closest existing timestamp
            const closest = existingTimestamps.reduce((prev, curr) => {
              return Math.abs(curr - purchaseTimestamp) <
                Math.abs(prev - purchaseTimestamp)
                ? curr
                : prev;
            });

            // Use closest if within tolerance, otherwise create new bucket
            if (Math.abs(closest - purchaseTimestamp) < tolerance) {
              targetTimestamp = closest;
            }
          }

          // Create grouped purchase event (similar to Convex usage grouping)
          const purchaseEvent: UsageEvent = {
            timestamp: targetTimestamp,
            featureId: `purchase_${product.id}`,
            featureName: product.name || "Product Purchase",
            amount: 0, // Not used for grouped events
            icon: grantedMetrics[0].icon, // Use first feature's icon
            isPurchase: true,
            isGrouped: true,
            groupType: undefined, // Not convex or integration
            metrics: grantedMetrics,
            productName: product.name,
          };

          // Add to eventsByTimestamp map
          if (!eventsByTimestamp.has(targetTimestamp)) {
            eventsByTimestamp.set(targetTimestamp, []);
          }
          const periodEvents = eventsByTimestamp.get(targetTimestamp)!;

          // Add purchase events at the beginning (before usage events)
          periodEvents.unshift(purchaseEvent);
        }
      }
    }

    // Merge custom earn credit grants (bounty approvals + referral spin awards)
    if (earnCreditEvents.length > 0) {
      // Honor current filters: only show if Agent Credits is enabled.
      if (validSelectedFeatures.includes("agent_credits")) {
        const now = currentTime;
        let rangeStartTime = 0;

        switch (selectedRange) {
          case "24h":
            rangeStartTime = now - 24 * 60 * 60 * 1000;
            break;
          case "7d":
            rangeStartTime = now - 7 * 24 * 60 * 60 * 1000;
            break;
          case "30d":
            rangeStartTime = now - 30 * 24 * 60 * 60 * 1000;
            break;
          case "90d":
            rangeStartTime = now - 90 * 24 * 60 * 60 * 1000;
            break;
          case "last_cycle":
            const currentPeriodStart =
              customer?.products?.[0]?.current_period_start;
            rangeStartTime =
              currentPeriodStart || now - 30 * 24 * 60 * 60 * 1000;
            break;
        }

        for (const earnEvent of earnCreditEvents) {
          if (
            earnEvent.timestamp < rangeStartTime ||
            earnEvent.timestamp > now ||
            earnEvent.amount <= 0
          ) {
            continue;
          }

          const earnUsageEvent: UsageEvent = {
            timestamp: earnEvent.timestamp,
            featureId: earnEvent.featureId,
            featureName: earnEvent.title,
            amount: earnEvent.amount,
            icon: earnEvent.source === "bounty" ? Award : Gift,
            isPurchase: true,
            productName: `${earnEvent.title}: ${earnEvent.subtitle}`,
            isEarnCredit: true,
          };

          if (!eventsByTimestamp.has(earnEvent.timestamp)) {
            eventsByTimestamp.set(earnEvent.timestamp, []);
          }
          const periodEvents = eventsByTimestamp.get(earnEvent.timestamp)!;
          periodEvents.unshift(earnUsageEvent);
        }
      }
    }

    // Convert map to sorted array of event groups, filtering out empty groups
    const allEventGroups: EventGroup[] = Array.from(eventsByTimestamp.entries())
      .map(([timestamp, events]) => ({
        timestamp,
        events,
      }))
      .filter((group) => group.events.length > 0)
      .sort((a, b) => b.timestamp - a.timestamp);

    // Filter event groups based on selected event types
    const filteredEventGroups: EventGroup[] = allEventGroups
      .map((group) => ({
        ...group,
        events: group.events.filter((event) => {
          const isIncoming = event.isPurchase === true;
          const isOutgoing = !event.isPurchase;

          if (selectedEventTypes.length === 0) {
            return false; // No event types selected, show nothing
          }

          if (
            selectedEventTypes.includes("incoming") &&
            selectedEventTypes.includes("outgoing")
          ) {
            return true; // Both selected, show all
          }

          if (selectedEventTypes.includes("incoming") && isIncoming) {
            return true;
          }

          if (selectedEventTypes.includes("outgoing") && isOutgoing) {
            return true;
          }

          return false;
        }),
      }))
      .filter((group) => group.events.length > 0); // Remove empty groups

    return filteredEventGroups;
  }, [
    analyticsData,
    customer,
    earnCreditEvents,
    selectedRange,
    validSelectedFeatures,
    selectedEventTypes,
    currentTime,
  ]);

  // Format timestamp as absolute time range
  const formatRelativeTime = (timestamp: number, range: TimeRange): string => {
    const date = new Date(timestamp);
    const now = new Date();

    // For 24h range, show hourly time ranges (e.g., "2:00 PM - 3:00 PM")
    if (range === "24h") {
      const startHour = date.getHours();
      const endHour = (startHour + 1) % 24;

      const formatHour = (hour: number) => {
        const period = hour >= 12 ? "PM" : "AM";
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `${displayHour}:00 ${period}`;
      };

      return `${formatHour(startHour)} - ${formatHour(endHour)}`;
    }

    // For longer ranges, show date (e.g., "Nov 21", "Today")
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) return "Today";

    const isYesterday =
      date.getDate() === now.getDate() - 1 &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isYesterday) return "Yesterday";

    // Format as "Nov 21"
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="flex h-[600px] flex-col rounded-[20px] border border-white bg-white/40 outline outline-1 outline-white transition-all duration-200">
      <style>{`
        .usage-timeline-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(216, 180, 254, 0.6) rgba(255, 255, 255, 0.3);
          scrollbar-gutter: stable;
          /* GPU acceleration hint */
          will-change: scroll-position;
          transform: translateZ(0);
        }
        .usage-timeline-scroll::-webkit-scrollbar {
          width: 10px;
          -webkit-appearance: none;
          appearance: none;
        }
        .usage-timeline-scroll::-webkit-scrollbar:vertical {
          width: 10px;
        }
        .usage-timeline-scroll::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 10px;
          margin: 4px 0;
        }
        .usage-timeline-scroll::-webkit-scrollbar-thumb {
          background: rgba(216, 180, 254, 0.6);
          border-radius: 10px;
          border: 2px solid rgba(255, 255, 255, 0.5);
          min-height: 40px;
        }
        .usage-timeline-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(192, 132, 252, 0.8);
        }
        .usage-timeline-scroll::-webkit-scrollbar-button {
          display: none;
        }
        @keyframes filter-glow {
          0%, 100% {
            box-shadow: 0 0 4px rgba(251, 146, 60, 0.25), 0 0 8px rgba(251, 146, 60, 0.15);
          }
          50% {
            box-shadow: 0 0 6px rgba(251, 146, 60, 0.35), 0 0 10px rgba(251, 146, 60, 0.2);
          }
        }
        .filter-button-glow {
          /* Limited animation - 3 iterations then stops to prevent infinite GPU usage */
          animation: filter-glow 2s ease-in-out 3;
        }
      `}</style>
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="mb-1 font-['PP_Církva'] text-lg font-normal text-zinc-800">
              Recent Events
            </h3>
            <p className="text-xs text-zinc-600">
              {selectedRange === "24h"
                ? "Events grouped by hour"
                : "Events grouped by day"}
            </p>
          </div>
          <button
            onClick={() => setFiltersVisible(!filtersVisible)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
              filtersVisible
                ? "border-purple-300 bg-purple-50 text-purple-600 hover:border-purple-400"
                : "border-white/50 bg-white/40 text-zinc-600 hover:border-purple-200 hover:bg-white/50"
            }`}
            aria-label="Toggle filters"
          >
            <motion.div
              animate={{ rotate: filtersVisible ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </motion.div>
          </button>
        </div>

        {/* Filters Section */}
        <AnimatePresence initial={false}>
          {filtersVisible && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] as const }}
              className="mb-4 overflow-hidden"
            >
              <div className="space-y-3">
                {/* Time Range Selector */}
                <div className="relative">
                  <select
                    value={selectedRange}
                    onChange={(e) =>
                      setSelectedRange(e.target.value as TimeRange)
                    }
                    className="w-full appearance-none rounded-[12px] border border-white/50 bg-white/40 px-3 py-2 pr-8 text-sm font-medium text-zinc-800 outline outline-1 outline-white/30 transition-all hover:bg-white/50 focus:border-purple-300 focus:outline-purple-200 focus:ring-2 focus:ring-purple-100"
                  >
                    {TIME_RANGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                </div>

                {/* Quick Feature Filters */}
                <div>
                  <p className="mb-2 text-xs font-semibold text-zinc-600">
                    Usage Categories
                  </p>
                  <div className="flex flex-wrap gap-2 p-1">
                    {/* Agent Credits filter - always first */}
                    {nonConvexFeatureIds.includes("agent_credits") &&
                      (() => {
                        const config = FEATURE_CONFIG.agent_credits;
                        const isSelected =
                          validSelectedFeatures.includes("agent_credits");

                        return (
                          <button
                            key="agent_credits"
                            onClick={() => toggleFeature("agent_credits")}
                            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                              isSelected
                                ? "border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100"
                                : "border-zinc-300 bg-white/50 text-zinc-600 hover:bg-white/70"
                            } ${noFeaturesSelected ? "filter-button-glow" : ""}`}
                          >
                            <TokenIcon size="sm" />
                            <span>{config.name}</span>
                          </button>
                        );
                      })()}

                    {/* Convex group filter - second */}
                    {convexFeatureIds.length > 0 && (
                      <button
                        onClick={toggleConvexGroup}
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                          convexFeatureIds.every((id) =>
                            validSelectedFeatures.includes(id),
                          )
                            ? "border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100"
                            : "border-zinc-300 bg-white/50 text-zinc-600 hover:bg-white/70"
                        } ${noFeaturesSelected ? "filter-button-glow" : ""}`}
                      >
                        <ConvexIcon size="sm" />
                        <span>Convex</span>
                      </button>
                    )}

                    {/* Integrations group filter - third */}
                    {integrationFeatureIds.length > 0 && (
                      <button
                        onClick={toggleIntegrationGroup}
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                          integrationFeatureIds.every((id) =>
                            validSelectedFeatures.includes(id),
                          )
                            ? "border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100"
                            : "border-zinc-300 bg-white/50 text-zinc-600 hover:bg-white/70"
                        } ${noFeaturesSelected ? "filter-button-glow" : ""}`}
                      >
                        <Unplug className="h-3 w-3" />
                        <span>Integrations</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Event Type Filters (Incoming/Outgoing) */}
                <div>
                  <p className="mb-2 text-xs font-semibold text-zinc-600">
                    Event Type
                  </p>
                  <div className="flex flex-wrap gap-2 p-1">
                    {/* Incoming filter */}
                    <button
                      onClick={() => toggleEventType("incoming")}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                        selectedEventTypes.includes("incoming")
                          ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                          : "border-zinc-300 bg-white/50 text-zinc-600 hover:bg-white/70"
                      } ${noEventTypesSelected ? "filter-button-glow" : ""}`}
                    >
                      <ArrowUp className="h-3 w-3" />
                      <span>Incoming</span>
                    </button>

                    {/* Outgoing filter */}
                    <button
                      onClick={() => toggleEventType("outgoing")}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                        selectedEventTypes.includes("outgoing")
                          ? "border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100"
                          : "border-zinc-300 bg-white/50 text-zinc-600 hover:bg-white/70"
                      } ${noEventTypesSelected ? "filter-button-glow" : ""}`}
                    >
                      <ArrowDown className="h-3 w-3" />
                      <span>Outgoing</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Events Timeline */}
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            className="usage-timeline-scroll absolute inset-0 overflow-y-scroll px-2 pb-2"
          >
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Activity className="mb-3 h-12 w-12 animate-pulse text-zinc-300" />
                <p className="text-sm font-medium text-zinc-600">
                  Loading events...
                </p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Activity className="mb-3 h-12 w-12 text-red-300" />
                <p className="text-sm font-medium text-red-600">
                  Failed to load events
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {error?.message || "Please try again later"}
                </p>
              </div>
            ) : selectedEventTypes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Activity className="mb-3 h-12 w-12 text-zinc-300" />
                <p className="text-sm font-medium text-zinc-600">
                  No event types selected
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Select incoming or outgoing events above to view
                </p>
              </div>
            ) : validSelectedFeatures.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Activity className="mb-3 h-12 w-12 text-zinc-300" />
                <p className="text-sm font-medium text-zinc-600">
                  No features selected
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Select features above to view events
                </p>
              </div>
            ) : eventGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Activity className="mb-3 h-12 w-12 text-zinc-300" />
                <p className="text-sm font-medium text-zinc-600">
                  No events in this period
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Usage events will appear here as you use features
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {eventGroups.map((group, groupIndex) => (
                  <div
                    key={`group-${group.timestamp}-${groupIndex}`}
                    className="relative pt-3"
                  >
                    {/* Date Header - embedded in border like fieldset legend */}
                    <div className="absolute left-3 top-0 bg-white/40 px-2">
                      <h4 className="text-sm font-semibold text-zinc-700">
                        {formatRelativeTime(group.timestamp, selectedRange)}
                      </h4>
                    </div>

                    {/* All events for this date in a single container */}
                    <div className="rounded-[12px] border border-white/50 bg-white/20 p-3 outline outline-2 outline-purple-200/60">
                      <div>
                        {group.events.map((event, eventIndex) => {
                          const Icon = event.icon;
                          const isLastEvent =
                            eventIndex === group.events.length - 1;

                          // Render grouped events (Convex, Integration, or Purchase)
                          if (event.isGrouped && event.metrics) {
                            const isConvex = event.groupType === "convex";
                            const isPurchase = event.isPurchase;

                            // Determine colors based on event type
                            const metricIconColor = isPurchase
                              ? "text-green-500"
                              : "text-purple-500";
                            const metricValueColor = isPurchase
                              ? "text-green-600"
                              : "text-purple-600";

                            // Render purchase events as collapsible accordions (default closed)
                            if (isPurchase) {
                              // Determine header text based on metrics
                              let headerText = "";
                              if (event.metrics.length === 1) {
                                // Single feature - use feature name (e.g., "Compute addon added")
                                headerText = `${event.metrics[0].featureName} added`;
                              } else {
                                // Multiple features - use product name (e.g., "Hobby resources added")
                                headerText = `${event.featureName} resources added`;
                              }

                              // Group metrics by type
                              const tokenMetrics = event.metrics.filter(
                                (m) => m.featureId === "agent_credits",
                              );
                              const convexMetrics = event.metrics.filter((m) =>
                                m.featureId.startsWith("convex_"),
                              );
                              const integrationMetrics = event.metrics.filter(
                                (m) =>
                                  m.featureId !== "agent_credits" &&
                                  !m.featureId.startsWith("convex_"),
                              );

                              return (
                                <div
                                  key={`${event.featureId}-${event.timestamp}-${eventIndex}`}
                                  className={
                                    !isLastEvent
                                      ? "border-b border-white/30 pb-2"
                                      : ""
                                  }
                                >
                                  <Accordion type="single" collapsible>
                                    <AccordionItem
                                      value={event.featureId}
                                      className="border-none"
                                    >
                                      <AccordionTrigger className="rounded-t-lg border border-b-0 border-green-200 bg-green-50 px-2 py-2 hover:no-underline">
                                        <div className="flex items-center gap-2">
                                          <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-100/80 to-green-200/60">
                                            <ArrowUp className="h-3 w-3 text-green-600" />
                                          </div>
                                          <p className="text-sm font-semibold leading-none text-zinc-800">
                                            {headerText}
                                          </p>
                                        </div>
                                      </AccordionTrigger>
                                      <AccordionContent>
                                        <div className="space-y-3 rounded-b-lg border border-t-0 border-green-200 bg-green-50 py-2 pr-2">
                                          {/* Agent Credits */}
                                          {tokenMetrics.length > 0 &&
                                            tokenMetrics.map((metric) => {
                                              const formattedValue =
                                                formatFeatureValue(
                                                  metric.featureId,
                                                  metric.amount,
                                                );
                                              const hasUnit =
                                                formattedValue.includes(" ");
                                              const [value, ...unitParts] =
                                                hasUnit
                                                  ? formattedValue.split(" ")
                                                  : [formattedValue];
                                              const unit = hasUnit
                                                ? unitParts.join(" ")
                                                : getFeatureUnit(
                                                    metric.featureId,
                                                    metric.amount,
                                                  );

                                              return (
                                                <div key={metric.featureId}>
                                                  <div className="flex items-start justify-between">
                                                    <div className="flex">
                                                      <div className="flex h-8 w-8 items-center justify-center">
                                                        <TokenIcon size="sm" />
                                                      </div>
                                                      <div className="pt-[9px]">
                                                        <p className="text-sm font-semibold leading-none text-zinc-800">
                                                          {metric.featureName}
                                                        </p>
                                                      </div>
                                                    </div>
                                                    <div className="pb-px pt-[6px] text-right leading-tight">
                                                      <p className="text-sm font-bold text-green-600">
                                                        +{value}
                                                      </p>
                                                      <p className="text-xs text-zinc-500">
                                                        {unit}
                                                      </p>
                                                    </div>
                                                  </div>
                                                </div>
                                              );
                                            })}

                                          {/* Convex Refill */}
                                          {convexMetrics.length > 0 && (
                                            <div>
                                              <div className="flex items-center">
                                                <div className="flex h-8 w-8 items-center justify-center">
                                                  <ConvexIcon size="lg" />
                                                </div>
                                                <p className="text-sm font-semibold leading-none text-zinc-800">
                                                  Convex Refill
                                                </p>
                                              </div>
                                              <div className="ml-8 mt-2 space-y-1.5">
                                                {convexMetrics
                                                  .sort((a, b) => {
                                                    const order = [
                                                      "convex_function_calls",
                                                      "convex_compute",
                                                      "convex_database_bw",
                                                      "convex_file_bw",
                                                    ];
                                                    return (
                                                      order.indexOf(
                                                        a.featureId,
                                                      ) -
                                                      order.indexOf(b.featureId)
                                                    );
                                                  })
                                                  .map((metric) => {
                                                    const MetricIcon =
                                                      metric.icon;
                                                    const formattedValue =
                                                      formatFeatureValue(
                                                        metric.featureId,
                                                        metric.amount,
                                                      );
                                                    const hasUnit =
                                                      formattedValue.includes(
                                                        " ",
                                                      );
                                                    const [
                                                      value,
                                                      ...unitParts
                                                    ] = hasUnit
                                                      ? formattedValue.split(
                                                          " ",
                                                        )
                                                      : [formattedValue];
                                                    const unit = hasUnit
                                                      ? unitParts.join(" ")
                                                      : getFeatureUnit(
                                                          metric.featureId,
                                                          metric.amount,
                                                        );

                                                    return (
                                                      <div
                                                        key={metric.featureId}
                                                        className="flex items-center justify-between gap-2 text-xs"
                                                      >
                                                        <div className="flex min-w-0 items-center gap-1.5">
                                                          <MetricIcon className="h-3.5 w-3.5 flex-shrink-0 text-green-500" />
                                                          <span className="font-medium text-zinc-700">
                                                            {metric.featureName}
                                                            :
                                                          </span>
                                                        </div>
                                                        <span className="whitespace-nowrap font-semibold text-green-600">
                                                          +{value}{" "}
                                                          <span className="text-zinc-500">
                                                            {unit}
                                                          </span>
                                                        </span>
                                                      </div>
                                                    );
                                                  })}
                                              </div>
                                            </div>
                                          )}

                                          {/* Integration Refill */}
                                          {integrationMetrics.length > 0 && (
                                            <div>
                                              <div className="flex items-center">
                                                <div className="mx-1.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-100/80 to-green-200/60">
                                                  <Unplug className="h-3 w-3 text-green-600" />
                                                </div>
                                                <p className="text-sm font-semibold leading-none text-zinc-800">
                                                  Integration Refill
                                                </p>
                                              </div>
                                              <div className="ml-8 mt-2 space-y-1.5">
                                                {integrationMetrics
                                                  .sort((a, b) =>
                                                    a.featureName.localeCompare(
                                                      b.featureName,
                                                    ),
                                                  )
                                                  .map((metric) => {
                                                    const MetricIcon =
                                                      metric.icon;
                                                    const formattedValue =
                                                      formatFeatureValue(
                                                        metric.featureId,
                                                        metric.amount,
                                                      );
                                                    const hasUnit =
                                                      formattedValue.includes(
                                                        " ",
                                                      );
                                                    const [
                                                      value,
                                                      ...unitParts
                                                    ] = hasUnit
                                                      ? formattedValue.split(
                                                          " ",
                                                        )
                                                      : [formattedValue];
                                                    const unit = hasUnit
                                                      ? unitParts.join(" ")
                                                      : getFeatureUnit(
                                                          metric.featureId,
                                                          metric.amount,
                                                        );

                                                    return (
                                                      <div
                                                        key={metric.featureId}
                                                        className="flex items-center justify-between gap-2 text-xs"
                                                      >
                                                        <div className="flex min-w-0 items-center gap-1.5">
                                                          <MetricIcon className="h-3.5 w-3.5 flex-shrink-0 text-green-500" />
                                                          <span className="font-medium text-zinc-700">
                                                            {metric.featureName}
                                                            :
                                                          </span>
                                                        </div>
                                                        <span className="whitespace-nowrap font-semibold text-green-600">
                                                          +{value}{" "}
                                                          <span className="text-zinc-500">
                                                            {unit}
                                                          </span>
                                                        </span>
                                                      </div>
                                                    );
                                                  })}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </AccordionContent>
                                    </AccordionItem>
                                  </Accordion>
                                </div>
                              );
                            }

                            // Render usage events (Convex, Integration) as before
                            return (
                              <div
                                key={`${event.featureId}-${event.timestamp}-${eventIndex}`}
                                className={
                                  !isLastEvent
                                    ? "border-b border-white/30 pb-2"
                                    : ""
                                }
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center">
                                    {isConvex ? (
                                      <div className="flex h-8 w-8 items-center justify-center">
                                        <ConvexIcon size="lg" />
                                      </div>
                                    ) : (
                                      <div className="mx-1.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-100/80 to-purple-200/60">
                                        <Unplug className="h-3 w-3 text-purple-600" />
                                      </div>
                                    )}
                                    <p className="text-sm font-semibold leading-none text-zinc-800">
                                      {event.featureName}
                                    </p>
                                  </div>
                                </div>
                                {/* Metrics list */}
                                <div className="ml-8 mt-2 space-y-1.5">
                                  {event.metrics.map((metric) => {
                                    const MetricIcon = metric.icon;
                                    const formattedValue = formatFeatureValue(
                                      metric.featureId,
                                      metric.amount,
                                    );
                                    const hasUnit =
                                      formattedValue.includes(" ");
                                    const [value, ...unitParts] = hasUnit
                                      ? formattedValue.split(" ")
                                      : [formattedValue];
                                    const unit = hasUnit
                                      ? unitParts.join(" ")
                                      : getFeatureUnit(
                                          metric.featureId,
                                          metric.amount,
                                        );

                                    return (
                                      <div
                                        key={metric.featureId}
                                        className="flex items-center justify-between gap-2 text-xs"
                                      >
                                        <div className="flex min-w-0 items-center gap-1.5">
                                          <MetricIcon
                                            className={`h-3.5 w-3.5 flex-shrink-0 ${metricIconColor}`}
                                          />
                                          <span className="font-medium text-zinc-700">
                                            {metric.featureName}:
                                          </span>
                                        </div>
                                        <span
                                          className={`whitespace-nowrap font-semibold ${metricValueColor}`}
                                        >
                                          {value}{" "}
                                          <span className="text-zinc-500">
                                            {unit}
                                          </span>
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          }

                          // Render individual events (non-Convex)
                          // Check if this is a purchase event
                          const isPurchaseEvent = event.isPurchase;
                          const isEarnCreditEvent = event.isEarnCredit;
                          const displayColors = isEarnCreditEvent
                            ? {
                                iconBg: "from-emerald-100/90 to-emerald-200/70",
                                iconColor: "text-emerald-700",
                                valueColor: "text-emerald-700",
                              }
                            : isPurchaseEvent
                              ? {
                                  iconBg: "from-green-100/80 to-green-200/60",
                                  iconColor: "text-green-600",
                                  valueColor: "text-green-600",
                                }
                              : {
                                  iconBg: "from-purple-100/80 to-purple-200/60",
                                  iconColor: "text-purple-600",
                                  valueColor: "text-purple-600",
                                };

                          return (
                            <div
                              key={`${event.featureId}-${event.timestamp}-${eventIndex}`}
                              className={
                                !isLastEvent
                                  ? "border-b border-white/30 pb-2"
                                  : ""
                              }
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex">
                                  {event.featureId === "agent_credits" &&
                                  !isPurchaseEvent ? (
                                    <div className="flex h-8 w-8 items-center justify-center">
                                      <TokenIcon size="sm" />
                                    </div>
                                  ) : (
                                    <div
                                      className={`flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br ${displayColors.iconBg}`}
                                    >
                                      <Icon
                                        className={`h-4 w-4 ${displayColors.iconColor}`}
                                      />
                                    </div>
                                  )}
                                  <div className="pt-[9px]">
                                    <p className="text-sm font-semibold leading-none text-zinc-800">
                                      {isPurchaseEvent && event.productName
                                        ? event.productName
                                        : event.featureName}
                                    </p>
                                  </div>
                                </div>
                                <div className="pb-px pt-[6px] text-right leading-tight">
                                  {(() => {
                                    const formattedValue = formatFeatureValue(
                                      event.featureId,
                                      event.amount,
                                    );
                                    // Check if formatted value includes unit (contains space)
                                    const hasUnit =
                                      formattedValue.includes(" ");

                                    if (hasUnit) {
                                      // Format includes unit (e.g., "10.24 MB", "20.48 MB-h")
                                      const [value, ...unitParts] =
                                        formattedValue.split(" ");
                                      const unit = unitParts.join(" ");
                                      return (
                                        <>
                                          <p
                                            className={`text-sm font-bold ${displayColors.valueColor}`}
                                          >
                                            {isPurchaseEvent ? "+" : ""}
                                            {value}
                                          </p>
                                          <p className="text-xs text-zinc-500">
                                            {isPurchaseEvent ? "added" : unit}
                                          </p>
                                        </>
                                      );
                                    } else {
                                      // Format is just the value, show unit separately
                                      return (
                                        <>
                                          <p
                                            className={`text-sm font-bold ${displayColors.valueColor}`}
                                          >
                                            {isPurchaseEvent ? "+" : ""}
                                            {formattedValue}
                                          </p>
                                          <p className="text-xs text-zinc-500">
                                            {isPurchaseEvent
                                              ? "added"
                                              : getFeatureUnit(
                                                  event.featureId,
                                                  event.amount,
                                                )}
                                          </p>
                                        </>
                                      );
                                    }
                                  })()}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Fade gradient overlay to indicate scrollable content */}
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white/90 via-white/60 to-transparent transition-opacity duration-300 ease-out"
            style={{ opacity: gradientOpacity }}
          ></div>
        </div>
      </div>
    </div>
  );
}
