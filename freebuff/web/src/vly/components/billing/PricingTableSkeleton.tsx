/**
 * Pricing Table Skeleton Component
 * Loading placeholder for the Autumn pricing table
 */

export function PricingTableSkeleton() {
  return (
    <div className="space-y-8">
      <div>
        <div className="mb-4 flex items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded-[10px] bg-white/30" />
          <div className="h-6 w-16 animate-pulse rounded bg-white/30" />
          <div className="h-px flex-1 bg-gradient-to-r from-purple-200/50 to-transparent"></div>
        </div>

        <div className="mb-6 flex items-center justify-center space-x-3 rounded-[15px] border border-white/60 bg-white/30 p-3 outline outline-1 outline-white/40 backdrop-blur-[80px]">
          <div className="h-4 w-16 animate-pulse rounded bg-white/30" />
          <div className="h-6 w-11 animate-pulse rounded-full bg-white/30" />
          <div className="h-4 w-14 animate-pulse rounded bg-white/30" />
        </div>

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((index) => (
            <div
              key={index}
              className={`h-[600px] w-full max-w-xl animate-pulse rounded-[20px] border border-white/50 bg-white/40 py-6 outline outline-1 outline-white/60 backdrop-blur-[100px] ${
                index === 2 ? "lg:h-[calc(100%+48px)] lg:-translate-y-6" : ""
              }`}
            >
              <div className="flex h-full flex-col p-6">
                <div className="mb-4 h-7 w-24 rounded bg-white/30" />
                <div className="mb-4 h-16 w-full rounded-[12px] bg-white/30" />
                <div className="flex-grow space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-4 w-full rounded bg-white/30" />
                  ))}
                </div>
                <div className="h-12 w-full rounded-[15px] bg-white/30" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
