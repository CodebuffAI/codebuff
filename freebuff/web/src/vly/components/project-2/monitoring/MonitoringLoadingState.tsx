import React from "react";
import { Activity } from "lucide-react";
import { Skeleton } from "@/vly/components/ui/skeleton";

interface MonitoringLoadingStateProps {
  loading: boolean;
  error: string | null;
}

export default function MonitoringLoadingState({
  loading,
  error,
}: MonitoringLoadingStateProps) {
  if (loading) {
    return (
      <div className="w-full rounded-2xl border border-zinc-200/50 bg-white/40 shadow-sm backdrop-blur-sm">
        {/* Accordion Header Skeleton */}
        <div className="px-5 py-4">
          <Skeleton className="h-5 w-32" />
        </div>

        {/* Accordion Content Skeleton */}
        <div className="px-5 pb-5">
          <div className="space-y-5 pt-4">
            {/* Deployment Info Skeleton */}
            <div className="rounded-2xl border border-zinc-200/50 bg-gradient-to-br from-white/70 via-white/50 to-zinc-50/60 p-4 shadow-sm backdrop-blur-md">
              <Skeleton className="mb-1.5 h-3 w-20" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="mt-2 h-3 w-44" />
            </div>

            {/* Two-column grid skeleton */}
            <div className="space-y-5 lg:grid lg:grid-cols-2 lg:gap-5 lg:space-y-0">
              {/* Cost Breakdown Skeleton */}
              <div className="space-y-3">
                <Skeleton className="h-6 w-36" />
                <div className="overflow-hidden rounded-2xl border border-zinc-200/50 bg-white/30 shadow-sm backdrop-blur-sm">
                  <div className="space-y-0">
                    <div className="border-b border-zinc-200/40 bg-gradient-to-r from-zinc-50/80 to-zinc-100/50 p-3">
                      <div className="flex justify-between">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-3 w-12" />
                        <Skeleton className="h-3 w-10" />
                      </div>
                    </div>
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className="border-t border-zinc-200/20 bg-white/50 p-3"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="h-3 w-28" />
                          <Skeleton className="h-3 w-12" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Usage & Data Transfer Skeleton */}
              <div className="space-y-3">
                <Skeleton className="h-6 w-52" />
                <div className="overflow-hidden rounded-2xl border border-zinc-200/50 bg-white/30 shadow-sm backdrop-blur-sm">
                  <div className="space-y-0">
                    {[...Array(7)].map((_, i) => (
                      <div
                        key={i}
                        className="border-b border-zinc-200/30 bg-white/50 p-3 last:border-b-0"
                      >
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity Skeleton */}
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <div className="overflow-hidden rounded-2xl border border-zinc-200/50 bg-white/30 shadow-sm backdrop-blur-sm">
                <div className="space-y-0">
                  <div className="border-b border-zinc-200/40 bg-gradient-to-r from-zinc-50/90 to-zinc-100/80 p-3">
                    <div className="flex justify-between gap-4">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-14" />
                      <Skeleton className="h-3 w-14" />
                    </div>
                  </div>
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="border-t border-zinc-200/20 bg-white/40 p-3"
                    >
                      <div className="flex justify-between gap-4">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-3 w-12" />
                        <Skeleton className="h-3 w-14" />
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-300/50 bg-gradient-to-br from-red-50/80 to-red-100/60 p-5 shadow-sm backdrop-blur-md">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-red-200/50 p-2">
            <Activity className="h-4 w-4 text-red-700" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-900">
              Error Loading Metrics
            </h3>
            <p className="mt-1 text-sm text-red-800">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
