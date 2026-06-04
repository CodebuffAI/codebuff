'use client'

import Link from 'next/link'
import { AppShell } from '@/vly/components/app-shell/AppShell'

export default function DashboardBilling() {
  return (
    <AppShell title="Pricing">
      <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center px-5 py-12 text-center sm:px-6 sm:py-16">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground sm:text-sm">
          Billing paused
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl">
          Paid plans are temporarily unavailable
        </h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
          Freebuff Web is moving onto the shared Freebuff login and billing
          stack. Your projects and free usage remain available during the
          migration.
        </p>
        <div className="mt-8">
          <Link
            href="/web"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to projects
          </Link>
        </div>
      </main>
    </AppShell>
  )
}
