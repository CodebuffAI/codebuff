'use client'

import Link from 'next/link'

interface PlansPricingSectionProps {
  organizationId?: string | null
}

export function PlansPricingSection(_props: PlansPricingSectionProps = {}) {
  return (
    <section className="mx-auto max-w-2xl px-6 py-16 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        Billing paused
      </p>
      <h2 className="mt-3 text-2xl font-semibold text-zinc-950">
        Paid upgrades are temporarily unavailable
      </h2>
      <p className="mt-4 text-sm leading-6 text-zinc-600">
        Freebuff Web billing is being unified into Freebuff. Existing project
        access remains available, but checkout and paid plan changes are
        temporarily disabled.
      </p>
      <Link
        href="/web/dashboard"
        className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800"
      >
        Back to dashboard
      </Link>
    </section>
  )
}
