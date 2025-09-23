export default function StoreLoading() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header skeleton */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="h-10 w-64 bg-muted animate-pulse rounded mb-2" />
              <div className="h-6 w-96 bg-muted animate-pulse rounded" />
            </div>
          </div>
        </div>

        {/* Search and filters skeleton */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center md:justify-end">
            <div className="w-full md:flex-1 md:max-w-[200px]">
              <div className="h-10 bg-muted animate-pulse rounded" />
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <div className="h-10 w-40 bg-muted animate-pulse rounded" />
              <div className="h-10 w-32 bg-muted animate-pulse rounded" />
            </div>
          </div>
        </div>

        {/* Editor's choice skeleton */}
        <div className="mb-12">
          <div className="mb-6">
            <div className="h-8 w-48 bg-muted animate-pulse rounded mb-2" />
            <div className="h-4 w-full max-w-2xl bg-muted animate-pulse rounded" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-56 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </div>

        {/* All agents skeleton */}
        <div className="mt-12">
          <div className="mb-6">
            <div className="h-8 w-32 bg-muted animate-pulse rounded mb-2" />
            <div className="h-4 w-80 bg-muted animate-pulse rounded" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-56 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
