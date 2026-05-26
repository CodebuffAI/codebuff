/**
 * Convex Pricing Utilities (2025 Pricing Model)
 *
 * Professional Plan: $25/member/month includes:
 * - 250 GB-hours Action Compute
 * - 50 GB Database Storage
 * - 100 GB File Storage
 * - 50 GB File Bandwidth
 *
 * Overage Rates:
 * - $2 per 1M function calls
 * - $0.30 per GB-hour for compute
 * - $0.20 per GB/month for database storage
 * - $0.30 per GB for file bandwidth
 */

export const CONVEX_PRICING = {
  PROFESSIONAL: {
    BASE_PRICE: 25, // per member/month
    INCLUDED: {
      COMPUTE_GB_HOURS: 250,
      DATABASE_STORAGE_GB: 50,
      FILE_STORAGE_GB: 100,
      FILE_BANDWIDTH_GB: 50,
    },
    OVERAGE: {
      FUNCTION_CALLS_PER_MILLION: 2.0,
      COMPUTE_PER_GB_HOUR: 0.3,
      DATABASE_STORAGE_PER_GB: 0.2,
      DATABASE_BANDWIDTH_PER_GB: 0.2,
      FILE_BANDWIDTH_PER_GB: 0.3,
      FILE_STORAGE_PER_GB: 0.2,
    },
  },
  FREE: {
    // Free tier has limits but no overage charges
    // We'll show costs as if they were on Professional plan
  },
} as const;

export interface UsageMetrics {
  executionCount: number;
  executionTimeMs: number;
  actionMemoryUsedMb: number;
  dbReadBytes: number;
  dbWriteBytes: number;
  fileStorageReadBytes: number;
  fileStorageWriteBytes: number;
}

export interface CostBreakdown {
  compute: {
    gbHours: number;
    cost: number;
  };
  functionCalls: {
    count: number;
    cost: number;
  };
  databaseBandwidth: {
    gb: number;
    cost: number;
  };
  fileBandwidth: {
    gb: number;
    cost: number;
  };
  total: number;
}

/**
 * Calculate compute GB-hours from aggregated memory, execution time, and count.
 * Uses average memory per execution × total execution time to avoid
 * over-counting when both values are pre-summed across multiple executions.
 */
export function calculateComputeGBHours(
  memoryMb: number,
  executionTimeMs: number,
  executionCount?: number,
): number {
  if (memoryMb <= 0 || executionTimeMs <= 0) return 0;
  const avgMemoryMb =
    executionCount && executionCount > 0 ? memoryMb / executionCount : memoryMb;
  const memoryGB = avgMemoryMb / 1024;
  const executionHours = executionTimeMs / 3_600_000;
  return memoryGB * executionHours;
}

/**
 * Calculate cost breakdown from usage metrics
 */
export function calculateCosts(metrics: UsageMetrics): CostBreakdown {
  const pricing = CONVEX_PRICING.PROFESSIONAL.OVERAGE;

  const computeGBHours = calculateComputeGBHours(
    metrics.actionMemoryUsedMb,
    metrics.executionTimeMs,
    metrics.executionCount,
  );
  const computeCost = computeGBHours * pricing.COMPUTE_PER_GB_HOUR;

  // 2. Function call cost
  const functionCallCost =
    (metrics.executionCount / 1_000_000) * pricing.FUNCTION_CALLS_PER_MILLION;

  // 3. Database bandwidth cost (reads + writes)
  const dbBandwidthGB =
    (metrics.dbReadBytes + metrics.dbWriteBytes) / 1024 ** 3;
  const dbBandwidthCost = dbBandwidthGB * pricing.DATABASE_BANDWIDTH_PER_GB;

  // 4. File bandwidth cost
  const fileBandwidthGB =
    (metrics.fileStorageReadBytes + metrics.fileStorageWriteBytes) / 1024 ** 3;
  const fileBandwidthCost = fileBandwidthGB * pricing.FILE_BANDWIDTH_PER_GB;

  // Total cost
  const total =
    computeCost + functionCallCost + dbBandwidthCost + fileBandwidthCost;

  return {
    compute: {
      gbHours: computeGBHours,
      cost: computeCost,
    },
    functionCalls: {
      count: metrics.executionCount,
      cost: functionCallCost,
    },
    databaseBandwidth: {
      gb: dbBandwidthGB,
      cost: dbBandwidthCost,
    },
    fileBandwidth: {
      gb: fileBandwidthGB,
      cost: fileBandwidthCost,
    },
    total,
  };
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  if (amount < 0.01 && amount > 0) {
    return `$${amount.toFixed(4)}`;
  }
  return `$${amount.toFixed(2)}`;
}

/**
 * Calculate projected monthly cost based on current usage rate
 * @param costSoFar - Total cost accumulated so far
 * @param daysElapsed - Number of days into the billing period
 * @returns Projected monthly cost
 */
export function projectMonthlyCost(
  costSoFar: number,
  daysElapsed: number,
): number {
  if (daysElapsed === 0) return 0;
  const dailyRate = costSoFar / daysElapsed;
  return dailyRate * 30; // Project to 30-day month
}
