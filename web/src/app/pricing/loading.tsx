'use client'

import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'

export default function Loading() {
  return (
    <div className="grid md:grid-cols-4 gap-8">
      <Card className="bg-gray-900 text-white flex flex-col relative">
        <CardHeader className="min-h-[200px] flex flex-col">
          <div className="space-y-4">
            <div className="h-8 w-32 bg-gray-700 rounded animate-pulse" />
            <div className="h-10 w-24 bg-gray-700 rounded animate-pulse" />
            <div className="h-6 w-40 bg-gray-700 rounded animate-pulse" />
          </div>
        </CardHeader>
        <CardContent className="flex-grow flex flex-col justify-between pt-6">
          <div className="space-y-3">
            <div className="h-4 w-full bg-gray-700 rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-gray-700 rounded animate-pulse" />
          </div>
        </CardContent>
        <CardFooter className="w-full justify-center pt-6">
          <div className="h-10 w-full bg-gray-700 rounded animate-pulse" />
        </CardFooter>
      </Card>
    </div>
  )
}
