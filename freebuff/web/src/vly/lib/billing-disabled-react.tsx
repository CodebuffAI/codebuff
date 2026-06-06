import type { ReactNode } from 'react'

const UNLIMITED_USAGE = Number.MAX_SAFE_INTEGER

const migrationCustomer = {
  id: 'billing-disabled',
  products: [],
  features: new Proxy(
    {},
    {
      get: () => ({
        balance: UNLIMITED_USAGE,
        has_access: true,
        included_usage: UNLIMITED_USAGE,
        unlimited: true,
        usage: 0,
      }),
    },
  ),
}

async function noop(..._args: any[]): Promise<any> {
  return null
}

async function checkoutUnavailable(
  ..._args: any[]
): Promise<{ data: any; error: Error }> {
  return { data: null, error: null as any }
}

export function BillingDisabledProvider({
  children,
}: {
  children: ReactNode
} & any) {
  return <>{children}</>
}

export function useCustomer(..._args: any[]): {
  attach: (...args: any[]) => Promise<any>
  cancel: (...args: any[]) => Promise<any>
  checkout: (...args: any[]) => Promise<{ data: any; error: Error }>
  customer: any
  error: Error | null
  isLoading: boolean
  openBillingPortal: (...args: any[]) => Promise<any>
  refetch: (...args: any[]) => Promise<any>
} {
  return {
    attach: noop,
    cancel: noop,
    checkout: checkoutUnavailable,
    customer: migrationCustomer,
    error: null,
    isLoading: false,
    openBillingPortal: noop,
    refetch: noop,
  }
}

export function usePricingTable(..._args: any[]): any {
  return {
    error: null,
    isLoading: false,
    products: [],
  }
}

export function useAnalytics(..._args: any[]): any {
  return {
    data: [],
    error: null,
    isLoading: false,
  }
}

export function usePaywall(..._args: any[]): any {
  return {
    data: null,
    error: null,
    isLoading: false,
  }
}
