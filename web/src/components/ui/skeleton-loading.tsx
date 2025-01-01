import { Card, CardHeader, CardContent } from './card'
import { Skeleton } from './skeleton'
import { BackgroundBeams } from './background-beams'

export const SkeletonLoading = () => {
  return (
    <div className="overflow-hidden">
      <BackgroundBeams />
      <main className="container mx-auto px-4 py-20 relative z-10">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-t border-b py-4">
              <Skeleton className="h-6 w-48 mb-4" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>

            <div className="border-b pb-4">
              <Skeleton className="h-6 w-48 mb-4" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
