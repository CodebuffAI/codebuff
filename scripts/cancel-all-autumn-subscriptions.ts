import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const AUTUMN_API_URL = 'https://api.useautumn.com/v1'
const AUTUMN_API_VERSION = '2.3.0'
const STRIPE_API_URL = 'https://api.stripe.com/v1'
const MAX_ATTEMPTS = 4

type Environment = 'live' | 'sandbox'

type Options = {
  environment: Environment
  execute: boolean
  customerId?: string
  reportPath: string
}

type AutumnSubscription = {
  id?: string
  planId?: string
  plan_id?: string
  status?: string
}

type AutumnCustomer = {
  id: string
  email?: string
  env?: string
  stripeId?: string
  stripe_id?: string
  processors?: {
    stripe?: {
      id?: string
    }
  }
  subscriptions?: AutumnSubscription[]
}

type StripeSubscription = {
  id: string
  status: string
}

type StripeSubscriptionSchedule = {
  id: string
  status: string
}

type CustomerResult = {
  autumnCustomerId: string
  email?: string
  stripeCustomerId?: string
  autumnSubscriptions: Array<{
    id?: string
    planId?: string
    status?: string
    action: 'would_cancel' | 'cancelled' | 'failed'
    error?: string
  }>
  stripeSubscriptions: Array<{
    id: string
    status: string
    action: 'already_terminal' | 'would_cancel' | 'cancelled' | 'failed'
    error?: string
  }>
  stripeSchedules: Array<{
    id: string
    status: string
    action: 'already_terminal' | 'would_cancel' | 'cancelled' | 'failed'
    error?: string
  }>
  status: 'skipped' | 'would_cancel' | 'cancelled' | 'failed' | 'unresolved'
  error?: string
}

type Report = {
  generatedAt: string
  mode: 'dry-run' | 'execute'
  environment: Environment
  customerFilter?: string
  summary: {
    customersScanned: number
    customersWithSubscriptions: number
    customersCancelled: number
    customersFailed: number
    customersUnresolved: number
    stripeSubscriptionsCancelled: number
    stripeSchedulesCancelled: number
    autumnSubscriptionsCancelled: number
  }
  customers: CustomerResult[]
}

function usage(exitCode = 1): never {
  console.error(`usage:
  bun scripts/cancel-all-autumn-subscriptions.ts [options]

Options:
  --environment <live|sandbox>  Target Autumn/Stripe environment. Default: live.
  --customer-id <id>            Only inspect/cancel one exact Autumn customer ID.
  --report <path>               JSON audit report path.
  --execute                     Actually cancel subscriptions. Default is dry-run.
  --confirm <phrase>            Required with --execute. Phrase is printed by dry-run.
  --help                        Show this help.

Required environment variables:
  AUTUMN_SECRET_KEY             Autumn secret key for the selected environment.
  STRIPE_SECRET_KEY             Matching Stripe secret key.

Cancellation behavior:
  1. Stripe subscriptions and schedules are cancelled immediately with
     prorate=false and invoice_now=false, so the script creates no refund or
     final invoice.
  2. Autumn is then updated with no_billing_changes=true, so Autumn does not
     make a second billing change.

Always run a dry-run first. Use --customer-id with a test customer before
executing against every live customer.`)
  process.exit(exitCode)
}

function confirmationPhrase(environment: Environment) {
  return `CANCEL_ALL_${environment.toUpperCase()}_AUTUMN_SUBSCRIPTIONS_NOW`
}

function parseArgs(argv: string[]): Options {
  let environment: Environment = 'live'
  let execute = false
  let confirm: string | undefined
  let customerId: string | undefined
  let reportPath: string | undefined

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const value = argv[i + 1]

    switch (arg) {
      case '--environment':
        if (value !== 'live' && value !== 'sandbox') usage()
        environment = value
        i += 1
        break
      case '--customer-id':
        if (!value || value.startsWith('--')) usage()
        customerId = value
        i += 1
        break
      case '--report':
        if (!value || value.startsWith('--')) usage()
        reportPath = value
        i += 1
        break
      case '--execute':
        execute = true
        break
      case '--confirm':
        if (!value || value.startsWith('--')) usage()
        confirm = value
        i += 1
        break
      case '--help':
      case '-h':
        usage(0)
        break
      default:
        usage()
    }
  }

  if (execute && confirm !== confirmationPhrase(environment)) {
    throw new Error(
      `Refusing to execute. Pass --confirm ${confirmationPhrase(environment)}`,
    )
  }

  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
  return {
    environment,
    execute,
    customerId,
    reportPath:
      reportPath ??
      `debug/autumn-cancellation-${environment}-${timestamp}.json`,
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function assertMatchingStripeKey(key: string, environment: Environment) {
  const expectedPrefix = environment === 'live' ? 'sk_live_' : 'sk_test_'
  if (!key.startsWith(expectedPrefix)) {
    throw new Error(
      `STRIPE_SECRET_KEY must start with ${expectedPrefix} for ${environment}`,
    )
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  label: string,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, init)
      const text = await response.text()

      if (response.ok) {
        return (text ? JSON.parse(text) : {}) as T
      }

      const error = new Error(
        `${label} failed (${response.status}): ${text.slice(0, 1000)}`,
      )
      if (response.status !== 429 && response.status < 500) throw error

      lastError = error
      const retryAfter = Number(response.headers.get('retry-after'))
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 500 * 2 ** (attempt - 1),
      )
    } catch (error) {
      lastError = error
      if (
        error instanceof Error &&
        error.message.includes(`${label} failed (4`)
      ) {
        throw error
      }
      if (attempt < MAX_ATTEMPTS) await sleep(500 * 2 ** (attempt - 1))
    }
  }

  throw lastError
}

function autumnHeaders(secretKey: string) {
  return {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
    'x-api-version': AUTUMN_API_VERSION,
  }
}

function stripeHeaders(secretKey: string) {
  return {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
}

async function listAutumnCustomers(
  secretKey: string,
): Promise<AutumnCustomer[]> {
  const customers: AutumnCustomer[] = []
  let cursor: string | undefined

  do {
    const response = await requestJson<{
      list: AutumnCustomer[]
      next_cursor?: string | null
      nextCursor?: string | null
    }>(
      `${AUTUMN_API_URL}/customers.list`,
      {
        method: 'POST',
        headers: autumnHeaders(secretKey),
        body: JSON.stringify({ limit: 5000, start_cursor: cursor ?? '' }),
      },
      'Autumn customers.list',
    )
    customers.push(...response.list)
    cursor = response.next_cursor ?? response.nextCursor ?? undefined
  } while (cursor)

  return customers
}

async function listStripeSubscriptions(
  secretKey: string,
  stripeCustomerId: string,
): Promise<StripeSubscription[]> {
  const subscriptions: StripeSubscription[] = []
  let startingAfter: string | undefined

  do {
    const query = new URLSearchParams({
      customer: stripeCustomerId,
      status: 'all',
      limit: '100',
    })
    if (startingAfter) query.set('starting_after', startingAfter)

    const response = await requestJson<{
      data: StripeSubscription[]
      has_more: boolean
    }>(
      `${STRIPE_API_URL}/subscriptions?${query}`,
      { headers: stripeHeaders(secretKey) },
      `Stripe list subscriptions for ${stripeCustomerId}`,
    )
    subscriptions.push(...response.data)
    startingAfter = response.has_more ? response.data.at(-1)?.id : undefined
  } while (startingAfter)

  return subscriptions
}

async function listStripeSubscriptionSchedules(
  secretKey: string,
  stripeCustomerId: string,
): Promise<StripeSubscriptionSchedule[]> {
  const schedules: StripeSubscriptionSchedule[] = []
  let startingAfter: string | undefined

  do {
    const query = new URLSearchParams({
      customer: stripeCustomerId,
      limit: '100',
    })
    if (startingAfter) query.set('starting_after', startingAfter)

    const response = await requestJson<{
      data: StripeSubscriptionSchedule[]
      has_more: boolean
    }>(
      `${STRIPE_API_URL}/subscription_schedules?${query}`,
      { headers: stripeHeaders(secretKey) },
      `Stripe list subscription schedules for ${stripeCustomerId}`,
    )
    schedules.push(...response.data)
    startingAfter = response.has_more ? response.data.at(-1)?.id : undefined
  } while (startingAfter)

  return schedules
}

async function cancelStripeSubscription(secretKey: string, id: string) {
  await requestJson(
    `${STRIPE_API_URL}/subscriptions/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: stripeHeaders(secretKey),
      body: new URLSearchParams({
        invoice_now: 'false',
        prorate: 'false',
      }),
    },
    `Stripe cancel subscription ${id}`,
  )
}

async function cancelStripeSubscriptionSchedule(secretKey: string, id: string) {
  await requestJson(
    `${STRIPE_API_URL}/subscription_schedules/${encodeURIComponent(id)}/cancel`,
    {
      method: 'POST',
      headers: stripeHeaders(secretKey),
      body: new URLSearchParams({
        invoice_now: 'false',
        prorate: 'false',
      }),
    },
    `Stripe cancel subscription schedule ${id}`,
  )
}

async function cancelAutumnSubscription(
  secretKey: string,
  customerId: string,
  subscription: AutumnSubscription,
) {
  const planId = subscription.planId ?? subscription.plan_id
  const identifier = subscription.id
    ? { subscription_id: subscription.id }
    : planId
      ? { plan_id: planId }
      : null
  if (!identifier) {
    throw new Error('Autumn subscription has neither id nor planId')
  }

  await requestJson(
    `${AUTUMN_API_URL}/billing.update`,
    {
      method: 'POST',
      headers: autumnHeaders(secretKey),
      body: JSON.stringify({
        customer_id: customerId,
        ...identifier,
        cancel_action: 'cancel_immediately',
        no_billing_changes: true,
      }),
    },
    `Autumn cancel subscription ${subscription.id ?? planId}`,
  )
}

function activeAutumnSubscriptions(customer: AutumnCustomer) {
  return (customer.subscriptions ?? []).filter(
    (subscription) =>
      subscription.status === 'active' || subscription.status === 'scheduled',
  )
}

function autumnStripeCustomerId(customer: AutumnCustomer) {
  return (
    customer.processors?.stripe?.id ?? customer.stripeId ?? customer.stripe_id
  )
}

function isTerminalStripeSubscription(subscription: StripeSubscription) {
  return (
    subscription.status === 'canceled' ||
    subscription.status === 'incomplete_expired'
  )
}

function isTerminalStripeSchedule(schedule: StripeSubscriptionSchedule) {
  return (
    schedule.status === 'canceled' ||
    schedule.status === 'completed' ||
    schedule.status === 'released'
  )
}

async function processCustomer(args: {
  autumnKey: string
  stripeKey: string
  customer: AutumnCustomer
  execute: boolean
}): Promise<CustomerResult> {
  const { autumnKey, stripeKey, customer, execute } = args
  const autumnSubscriptions = activeAutumnSubscriptions(customer)
  const stripeCustomerId = autumnStripeCustomerId(customer)
  const result: CustomerResult = {
    autumnCustomerId: customer.id,
    email: customer.email,
    stripeCustomerId,
    autumnSubscriptions: autumnSubscriptions.map((subscription) => ({
      ...subscription,
      action: 'would_cancel',
    })),
    stripeSubscriptions: [],
    stripeSchedules: [],
    status: execute ? 'cancelled' : 'would_cancel',
  }

  if (!stripeCustomerId) {
    result.status = 'skipped'
    result.error =
      'No Stripe customer ID; there is no Stripe subscription to cancel'
    return result
  }

  let stripeSubscriptions: StripeSubscription[]
  let stripeSchedules: StripeSubscriptionSchedule[]
  try {
    ;[stripeSubscriptions, stripeSchedules] = await Promise.all([
      listStripeSubscriptions(stripeKey, stripeCustomerId),
      listStripeSubscriptionSchedules(stripeKey, stripeCustomerId),
    ])
  } catch (error) {
    result.status = 'failed'
    result.error = errorMessage(error)
    return result
  }

  if (stripeSubscriptions.length === 0 && stripeSchedules.length === 0) {
    result.status = 'skipped'
    result.error = 'Stripe customer has no subscriptions'
    return result
  }

  result.stripeSubscriptions = stripeSubscriptions.map((subscription) => ({
    ...subscription,
    action: isTerminalStripeSubscription(subscription)
      ? 'already_terminal'
      : 'would_cancel',
  }))
  result.stripeSchedules = stripeSchedules.map((schedule) => ({
    ...schedule,
    action: isTerminalStripeSchedule(schedule)
      ? 'already_terminal'
      : 'would_cancel',
  }))

  if (!execute) return result

  for (const schedule of result.stripeSchedules) {
    if (schedule.action === 'already_terminal') continue
    try {
      await cancelStripeSubscriptionSchedule(stripeKey, schedule.id)
      schedule.action = 'cancelled'
    } catch (error) {
      schedule.action = 'failed'
      schedule.error = errorMessage(error)
    }
  }

  // Canceling an active schedule can also cancel its subscription. Refresh
  // subscriptions before canceling the remaining standalone subscriptions.
  try {
    stripeSubscriptions = await listStripeSubscriptions(
      stripeKey,
      stripeCustomerId,
    )
  } catch (error) {
    result.status = 'failed'
    result.error = `Could not refresh Stripe subscriptions after schedule cancellation: ${errorMessage(error)}`
    return result
  }
  result.stripeSubscriptions = stripeSubscriptions.map((subscription) => ({
    ...subscription,
    action: isTerminalStripeSubscription(subscription)
      ? 'already_terminal'
      : 'would_cancel',
  }))

  for (const subscription of result.stripeSubscriptions) {
    if (subscription.action === 'already_terminal') continue
    try {
      await cancelStripeSubscription(stripeKey, subscription.id)
      subscription.action = 'cancelled'
    } catch (error) {
      subscription.action = 'failed'
      subscription.error = errorMessage(error)
    }
  }

  if (
    result.stripeSubscriptions.some(({ action }) => action === 'failed') ||
    result.stripeSchedules.some(({ action }) => action === 'failed')
  ) {
    result.status = 'failed'
    result.error =
      'At least one Stripe subscription failed to cancel; Autumn was not updated'
    return result
  }

  for (const subscription of result.autumnSubscriptions) {
    try {
      await cancelAutumnSubscription(autumnKey, customer.id, subscription)
      subscription.action = 'cancelled'
    } catch (error) {
      subscription.action = 'failed'
      subscription.error = errorMessage(error)
    }
  }

  if (result.autumnSubscriptions.some(({ action }) => action === 'failed')) {
    result.status = 'failed'
    result.error =
      'Stripe renewal is cancelled, but at least one Autumn subscription failed to update'
  }

  return result
}

function summarize(report: Report) {
  for (const customer of report.customers) {
    if (customer.status !== 'skipped') {
      report.summary.customersWithSubscriptions += 1
    }
    if (customer.status === 'cancelled') report.summary.customersCancelled += 1
    if (customer.status === 'failed') report.summary.customersFailed += 1
    if (customer.status === 'unresolved')
      report.summary.customersUnresolved += 1
    report.summary.stripeSubscriptionsCancelled +=
      customer.stripeSubscriptions.filter(
        ({ action }) => action === 'cancelled',
      ).length
    report.summary.stripeSchedulesCancelled += customer.stripeSchedules.filter(
      ({ action }) => action === 'cancelled',
    ).length
    report.summary.autumnSubscriptionsCancelled +=
      customer.autumnSubscriptions.filter(
        ({ action }) => action === 'cancelled',
      ).length
  }
}

async function writeReport(path: string, report: Report) {
  const absolutePath = resolve(path)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`)
  return absolutePath
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const autumnKey = requireEnv('AUTUMN_SECRET_KEY')
  const stripeKey = requireEnv('STRIPE_SECRET_KEY')
  assertMatchingStripeKey(stripeKey, options.environment)

  console.log(
    `[autumn-cancel] ${options.execute ? 'EXECUTE' : 'DRY RUN'}: ${options.environment}`,
  )
  console.log('[autumn-cancel] loading Autumn customers')

  const allCustomers = await listAutumnCustomers(autumnKey)
  const customers = allCustomers.filter(
    (customer) =>
      customer.env === options.environment &&
      (!options.customerId || customer.id === options.customerId),
  )

  if (options.customerId && customers.length !== 1) {
    throw new Error(
      `Expected exactly one ${options.environment} Autumn customer with ID ${options.customerId}; found ${customers.length}`,
    )
  }

  const report: Report = {
    generatedAt: new Date().toISOString(),
    mode: options.execute ? 'execute' : 'dry-run',
    environment: options.environment,
    customerFilter: options.customerId,
    summary: {
      customersScanned: customers.length,
      customersWithSubscriptions: 0,
      customersCancelled: 0,
      customersFailed: 0,
      customersUnresolved: 0,
      stripeSubscriptionsCancelled: 0,
      stripeSchedulesCancelled: 0,
      autumnSubscriptionsCancelled: 0,
    },
    customers: [],
  }

  for (const [index, customer] of customers.entries()) {
    const subscriptions = activeAutumnSubscriptions(customer)

    console.log(
      `[autumn-cancel] ${index + 1}/${customers.length} ${customer.id} (${subscriptions.length} Autumn subscription(s))`,
    )
    report.customers.push(
      await processCustomer({
        autumnKey,
        stripeKey,
        customer,
        execute: options.execute,
      }),
    )
  }

  summarize(report)
  const reportPath = await writeReport(options.reportPath, report)
  console.log('[autumn-cancel] summary', report.summary)
  console.log(`[autumn-cancel] report: ${reportPath}`)

  if (!options.execute) {
    console.log(
      `[autumn-cancel] To execute, rerun with --execute --confirm ${confirmationPhrase(options.environment)}`,
    )
  }

  if (
    report.summary.customersFailed > 0 ||
    report.summary.customersUnresolved > 0
  ) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`[autumn-cancel] fatal: ${errorMessage(error)}`)
  process.exitCode = 1
})
