import type { CostBreakdown } from "@/convex/lib/convex_pricing";

export type UsageMetricsResponse = {
  deploymentName: string;
  // Deployment type for single deployments
  deploymentType?: "dev" | "prod" | "all";
  // Deployment names for dev and prod (only present when deploymentType is "all")
  devDeploymentName?: string;
  prodDeploymentName?: string;
  summary: {
    totalExecutions: number;
    avgExecutionTimeMs: number;
    totalActionMemoryMb: number;
    totalDbReadBytes: number;
    totalDbReadDocuments: number;
    totalDbWriteBytes: number;
    totalFileStorageReadBytes: number;
    totalFileStorageWriteBytes: number;
  };
  costs: CostBreakdown;
  timeSeries: Array<{
    timestamp: string;
    executionCount: number;
    executionTimeMs: number;
    avgExecutionTimeMs: number;
    actionMemoryUsedMb: number;
    dbReadBytes: number;
    dbReadDocuments: number;
    dbWriteBytes: number;
    fileStorageReadBytes: number;
    fileStorageWriteBytes: number;
    costs: CostBreakdown;
    // Optional deployment source for "all" deployment type
    deploymentType?: "dev" | "prod";
  }>;
  lastUpdated: string | null;
};

export type SandboxMetricsHistory = {
  sandboxId: string;
  timeSeries: Array<{
    timestamp: string;
    cpuUsagePercent: number;
    cpuLimitCores: number;
    memoryUsagePercent: number;
    memoryUsedBytes: number;
    memoryLimitBytes: number;
    diskUsagePercent: number;
    diskUsedBytes: number;
    diskSizeBytes: number;
    diskAvailableBytes: number;
    load1min: number;
    load5min: number;
    load15min: number;
  }>;
  startTime: string;
  endTime: string;
};

export type TimeRange = "billing_cycle" | "5m" | "1h" | "24h" | "7d" | "custom";

// Incident Dashboard Types (for Failures tab)
export interface IncidentDashboard {
  totalErrors: number;
  topFailingFunctions: Array<{
    functionPath: string;
    failureCount: number;
  }>;
  affectedDeployments: Array<{
    deploymentName: string;
    errorCount: number;
  }>;
}

// Performance Dashboard Types
export interface QueryCacheMetric {
  hitRate: number;
  totalQueries: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface WriteConflictItem {
  functionPath: string;
  conflictCount: number;
}

export interface SlowQueryItem {
  functionPath: string;
  avgExecutionTimeMs: number;
  maxExecutionTimeMs: number;
  executionCount: number;
}

export interface ResourceUsageItem {
  functionPath: string;
  totalDocumentsRead: number;
  totalDataReadBytes: number;
}

export interface PerformanceDashboard {
  queryCacheHitRate: QueryCacheMetric;
  writeConflicts: WriteConflictItem[];
  slowestQueries: SlowQueryItem[];
  slowestMutations: SlowQueryItem[];
  slowestActions: SlowQueryItem[];
  mostDocumentsRead: ResourceUsageItem[];
  mostDataRead: ResourceUsageItem[];
}

// Cost Dashboard Types
export interface FunctionCostItem {
  functionPath: string;
  executionCount: number;
  totalExecutionTimeMs: number;
  totalBandwidthBytes: number;
  estimatedCost: number;
}

export interface CostDashboard {
  summary: {
    totalExecutions: number;
    totalBandwidthBytes: number;
    totalExecutionTimeMs: number;
    estimatedTotalCost: number;
    costBreakdown: {
      functionCallsCost: number;
      computeCost: number;
      computeGBHours: number;
      dbBandwidthCost: number;
      dbBandwidthGB: number;
      fileBandwidthCost: number;
      fileBandwidthGB: number;
    };
  };
  topCostFunctions: FunctionCostItem[];
}
