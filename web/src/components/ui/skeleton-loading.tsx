import { Card, CardHeader, CardContent } from './card'
import { Skeleton } from './skeleton'

export const PricingCardSkeleton = () => {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-7 w-24" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </CardContent>
    </Card>
  )
}

export const AutoTopupCardSkeleton = () => {
  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-48" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </CardContent>
    </Card>
  )
}
