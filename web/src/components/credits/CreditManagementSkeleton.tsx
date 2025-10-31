import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function CreditManagementSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-8">
          {/* Buy Credits Section */}
          <div className="space-y-6">
            {/* Title with Billing Portal Link */}
            <div className="flex items-center justify-between">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>

            {/* Credit Options Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col p-4 h-20 gap-1 border rounded-md"
                >
                  <Skeleton className="h-6 w-16 mx-auto" />
                  <Skeleton className="h-4 w-12 mx-auto" />
                </div>
              ))}
            </div>

            {/* Custom Amount Input */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
              <div className="w-full flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <div className="flex flex-col md:flex-row gap-4 items-start">
                  <div className="w-full flex-1">
                    <Skeleton className="h-10 w-full" />
                  </div>
                  <Skeleton className="h-10 w-full md:w-32" />
                </div>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Auto-topup Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-6 w-16" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
