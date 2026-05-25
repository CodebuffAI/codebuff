import { Skeleton } from "@/components/ui/skeleton";

export function BillingSectionSkeleton() {
  return (
    <div className="space-y-6">
      {/* Top section with Your Plan and Add-ons side by side - Match actual layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Current Plan Status - Takes up 2 columns on larger screens */}
        <div className="rounded-[20px] border border-white bg-white/40 outline outline-1 outline-white backdrop-blur-[80px] transition-all duration-200 lg:col-span-2">
          <div className="p-6">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <div>
                <Skeleton className="mb-2 h-6 w-24" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-8 w-16 rounded-[10px]" />
            </div>

            {/* Credits Display */}
            <div className="space-y-6">
              {/* Agent Credits */}
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>

              {/* Email & AI Usage */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
                <div className="mt-2 flex items-center justify-between text-xs">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            </div>

            {/* Payment Method & Actions */}
            <div className="mt-4 border-t border-white/50 pt-3">
              <div className="mb-3 flex items-center justify-between text-sm">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>

              <div className="flex items-center justify-between">
                {/* Payment Method Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-3" />
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="ml-4 flex gap-2">
                  <Skeleton className="h-8 w-24 rounded-[10px]" />
                  <Skeleton className="h-8 w-16 rounded-[10px]" />
                  <Skeleton className="h-8 w-28 rounded-[10px]" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Add-ons Section - Takes up 1 column on larger screens */}
        <div className="rounded-[20px] border border-white bg-white/40 outline outline-1 outline-white backdrop-blur-[80px] transition-all duration-200">
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-5 w-28" />
                </div>
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <div className="max-h-[500px] overflow-y-auto pr-1">
              {/* Compact addon skeleton - matches showOnlyAddons rendering */}
              <div className="space-y-3">
                {[1, 2].map((index) => (
                  <div
                    key={index}
                    className="group relative flex flex-col rounded-[12px] border border-white/50 bg-white/20 p-4 outline outline-1 outline-white/30 backdrop-blur-sm"
                  >
                    {/* Header with title and price */}
                    <div className="mb-3">
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-6 w-6 rounded-full" />
                          <Skeleton className="h-4 w-20" />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-3 w-12" />
                      </div>
                    </div>

                    {/* Features list */}
                    <div className="mb-3 space-y-2">
                      {[1, 2].map((idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 text-xs"
                        >
                          <Skeleton className="h-3 w-3 rounded-full" />
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-2 w-3/4" />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Action button */}
                    <Skeleton className="h-8 w-full rounded-[8px]" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Table Skeleton */}
      <PricingTableSkeleton />
    </div>
  );
}

export function PricingTableSkeleton() {
  return (
    <div className="space-y-8">
      {/* Plans Section */}
      <div>
        <div className="mb-4 flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-[10px]" />
          <Skeleton className="h-6 w-16" />
          <div className="h-px flex-1 bg-gradient-to-r from-purple-200/50 to-transparent"></div>
        </div>

        {/* Annual Toggle */}
        <div className="mb-6 flex items-center justify-center space-x-3 rounded-[15px] border border-white/60 bg-white/30 p-3 outline outline-1 outline-white/40 backdrop-blur-[80px]">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-11 rounded-full" />
          <Skeleton className="h-4 w-14" />
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((index) => (
            <PricingCardSkeleton key={index} isRecommended={index === 2} />
          ))}
        </div>
      </div>

      {/* Add-ons Section */}
      <div>
        <div className="mb-4 flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-[10px]" />
          <Skeleton className="h-6 w-20" />
          <div className="h-px flex-1 bg-gradient-to-r from-purple-300/50 to-transparent"></div>
        </div>

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2].map((index) => (
            <PricingCardSkeleton key={index} isAddOn />
          ))}
        </div>
      </div>
    </div>
  );
}

function PricingCardSkeleton({
  isRecommended = false,
  isAddOn = false,
}: {
  isRecommended?: boolean;
  isAddOn?: boolean;
}) {
  return (
    <div
      className={`h-full w-full max-w-xl rounded-[20px] border border-white bg-white/40 py-6 outline outline-1 outline-white backdrop-blur-[80px] transition-all duration-200 ${
        isRecommended
          ? "bg-white/60 outline-white/80 lg:h-[calc(100%+48px)] lg:-translate-y-6 lg:shadow-lg"
          : ""
      } ${
        isAddOn ? "scale-95 border-zinc-200/60 bg-zinc-50/30 opacity-85" : ""
      }`}
    >
      {/* Recommended Badge */}
      {isRecommended && (
        <div className="absolute right-[-1px] top-[-1px] rounded-[10px] px-3 py-0.5 lg:right-4 lg:top-4 lg:rounded-full lg:py-1">
          <Skeleton className="h-4 w-20" />
        </div>
      )}

      <div
        className={`flex h-full flex-grow flex-col ${isRecommended ? "lg:translate-y-6" : ""}`}
      >
        <div className="h-full">
          <div className="flex flex-col">
            {/* Header */}
            <div className="px-6 pb-4">
              <Skeleton className="mb-2 h-7 w-24" />
              <Skeleton className="h-4 w-full" />
            </div>

            {/* Price Section */}
            <div className="mb-2">
              <div className="mb-4 flex h-16 items-center border-y border-white/30 bg-white/20 px-6 backdrop-blur-sm">
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            </div>
          </div>

          {/* Features List */}
          <div className="mb-6 flex-grow px-6">
            <div className="space-y-3">
              {[1, 2, 3, 4].map((index) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="flex flex-1 flex-col gap-1">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Button */}
        <div className={`px-6 ${isRecommended ? "lg:-translate-y-12" : ""}`}>
          <Skeleton className="h-12 w-full rounded-[15px]" />
        </div>
      </div>
    </div>
  );
}
