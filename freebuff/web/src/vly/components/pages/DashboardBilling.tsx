'use client'

import Link from 'next/link'
import { PageLayout } from '@/vly/components/test-landing/PageLayout'

export default function DashboardBilling() {
  return (
    <PageLayout showHome={true} showParallax={false}>
      <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center px-6 py-16 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Billing paused
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-zinc-950">
          Paid plans are temporarily unavailable
        </h1>
        <p className="mt-4 text-base leading-7 text-zinc-600">
          Vly is moving onto the shared Freebuff login and billing stack. Your
          projects and free usage remain available during the migration.
        </p>
        <div className="mt-8">
          <Link
            href="/web/dashboard"
            className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    </PageLayout>
  )
}
