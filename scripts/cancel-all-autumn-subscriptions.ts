import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const AUTUMN_API_URL = 'https://api.useautumn.com/v1'
const AUTUMN_API_VERSION = '2.3.0'
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
  canceled_at?: number | null
  canceledAt?: number | null
  auto_enable?: boolean
  autoEnable?: boolean
}

type AutumnCustomer = {
  id: string
  email?: string
  env?: string
  subscriptions?: AutumnSubscription[]
}

type CustomerResult = {
  autumnCustomerId: string
  email?: string
  subscriptions: Array<{
    id?: string
    planId?: string
    status?: string
    action:
      | 'already_cancelling'
      | 'would_cancel'
      | 'cancelled'
      | 'failed'
    cancelAction?: 'cancel_end_of_cycle' | 'cancel_immediately'
    error?: string
  }>
  status: 'skipped' | 'would_cancel' | 'cancelled' | 'failed'
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
    subscriptionsCancelled: number
  }
  customers: CustomerResult[]
}

function usage(exitCode = 1): never {
  console.error(`usage:
  bun scripts/cancel-all-autumn-subscriptions.ts [options]

Options:
  --environment <live|sandbox>  Target Autumn environment. Default: live.
  --customer-id <id>            Only inspect/cancel one exact Autumn customer ID.
  --report <path>               JSON audit report path.
  --execute                     Actually cancel subscriptions. Default is dry-run.
  --confirm <phrase>            Required with --execute. Phrase is printed by dry-run.
  --help                        Show this help.

Required environment variables:
  AUTUMN_SECRET_KEY             Autumn secret key for the selected environment.

Cancellation behavior:
  All cancellation goes through Autumn's billing.update endpoint. Autumn owns
  the underlying Stripe subscription and cancels it itself; this script never
  calls Stripe directly.

  Only PAID plans (base price or priced items) are cancelled. Free plans,
  earn rewards, and referral rewards are left untouched.

  - active subscriptions:    cancel_action=cancel_end_of_cycle
                             (customer keeps access until period end, no refund)
  - scheduled subscriptions: cancel_action=cancel_immediately
                             (not yet billed, so this just removes the schedule)

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

async function listPaidPlanIds(secretKey: string): Promise<Set<string>> {
  const response = await requestJson<{
    list: Array<{
      id: string
      price?: unknown
      items?: Array<{ price?: unknown }>
    }>
  }>(
    `${AUTUMN_API_URL}/plans`,
    { headers: autumnHeaders(secretKey) },
    'Autumn list plans',
  )
  // Only plans with a base price or priced items bill the customer. Free
  // plans (defaults, earn rewards, referral rewards) are left untouched.
  return new Set(
    response.list
      .filter(
        (plan) =>
          Boolean(plan.price) || (plan.items ?? []).some((item) => item.price),
      )
      .map((plan) => plan.id),
  )
}

async function listSubscribedAutumnCustomers(
  secretKey: string,
  paidPlanIds: Set<string>,
): Promise<AutumnCustomer[]> {
  const planIds = [...paidPlanIds]
  console.log(
    `[autumn-cancel] filtering customers subscribed to ${planIds.length} paid plan(s)`,
  )

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
        body: JSON.stringify({
          limit: 1000,
          start_cursor: cursor ?? '',
          plans: planIds.map((id) => ({ id })),
        }),
      },
      'Autumn customers.list',
    )
    customers.push(...response.list)
    cursor = response.next_cursor ?? response.nextCursor ?? undefined
  } while (cursor)

  return customers
}

async function getAutumnCustomer(
  secretKey: string,
  customerId: string,
): Promise<AutumnCustomer> {
  return await requestJson<AutumnCustomer>(
    `${AUTUMN_API_URL}/customers/${encodeURIComponent(customerId)}`,
    { headers: autumnHeaders(secretKey) },
    `Autumn get customer ${customerId}`,
  )
}

function cancelActionFor(
  subscription: AutumnSubscription,
): 'cancel_end_of_cycle' | 'cancel_immediately' {
  // Scheduled plans have not billed yet; cancelling them immediately just
  // removes the schedule and cannot trigger a refund.
  return subscription.status === 'scheduled'
    ? 'cancel_immediately'
    : 'cancel_end_of_cycle'
}

async function cancelAutumnSubscription(
  secretKey: string,
  customerId: string,
  subscription: AutumnSubscription,
  cancelAction: 'cancel_end_of_cycle' | 'cancel_immediately',
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

  // No no_billing_changes flag: Autumn applies the change to the underlying
  // Stripe subscription itself, so the Stripe side is cancelled by Autumn.
  await requestJson(
    `${AUTUMN_API_URL}/billing.update`,
    {
      method: 'POST',
      headers: autumnHeaders(secretKey),
      body: JSON.stringify({
        customer_id: customerId,
        ...identifier,
        cancel_action: cancelAction,
      }),
    },
    `Autumn cancel subscription ${subscription.id ?? planId}`,
  )
}

function isAlreadyCancelling(subscription: AutumnSubscription) {
  return Boolean(subscription.canceled_at ?? subscription.canceledAt)
}

function activeAutumnSubscriptions(
  customer: AutumnCustomer,
  paidPlanIds: Set<string>,
) {
  return (customer.subscriptions ?? []).filter((subscription) => {
    const planId = subscription.planId ?? subscription.plan_id
    return (
      (subscription.status === 'active' ||
        subscription.status === 'scheduled') &&
      planId !== undefined &&
      paidPlanIds.has(planId)
    )
  })
}

async function processCustomer(args: {
  autumnKey: string
  customer: AutumnCustomer
  paidPlanIds: Set<string>
  execute: boolean
}): Promise<CustomerResult> {
  const { autumnKey, customer, paidPlanIds, execute } = args
  const subscriptions = activeAutumnSubscriptions(customer, paidPlanIds)
  const result: CustomerResult = {
    autumnCustomerId: customer.id,
    email: customer.email,
    subscriptions: subscriptions.map((subscription) => ({
      id: subscription.id,
      planId: subscription.planId ?? subscription.plan_id,
      status: subscription.status,
      action: isAlreadyCancelling(subscription)
        ? 'already_cancelling'
        : 'would_cancel',
      cancelAction: isAlreadyCancelling(subscription)
        ? undefined
        : cancelActionFor(subscription),
    })),
    status: 'would_cancel',
  }

  if (subscriptions.length === 0) {
    result.status = 'skipped'
    result.error = 'No active or scheduled paid Autumn subscriptions'
    return result
  }

  if (result.subscriptions.every(({ action }) => action === 'already_cancelling')) {
    result.status = 'skipped'
    result.error = 'All subscriptions are already pending cancellation'
    return result
  }

  if (!execute) return result

  for (const [index, entry] of result.subscriptions.entries()) {
    if (entry.action !== 'would_cancel' || !entry.cancelAction) continue
    try {
      await cancelAutumnSubscription(
        autumnKey,
        customer.id,
        subscriptions[index],
        entry.cancelAction,
      )
      entry.action = 'cancelled'
    } catch (error) {
      entry.action = 'failed'
      entry.error = errorMessage(error)
    }
  }

  if (result.subscriptions.some(({ action }) => action === 'failed')) {
    result.status = 'failed'
    result.error = 'At least one Autumn subscription failed to cancel'
  } else {
    result.status = 'cancelled'
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
    report.summary.subscriptionsCancelled += customer.subscriptions.filter(
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

  console.log(
    `[autumn-cancel] ${options.execute ? 'EXECUTE' : 'DRY RUN'}: ${options.environment}`,
  )
  const paidPlanIds = await listPaidPlanIds(autumnKey)

  let customers: AutumnCustomer[]
  if (options.customerId) {
    console.log(`[autumn-cancel] loading customer ${options.customerId}`)
    const customer = await getAutumnCustomer(autumnKey, options.customerId)
    if (customer.env && customer.env !== options.environment) {
      throw new Error(
        `Customer ${options.customerId} belongs to env ${customer.env}, not ${options.environment}`,
      )
    }
    customers = [customer]
  } else {
    console.log('[autumn-cancel] loading subscribed Autumn customers')
    const allCustomers = await listSubscribedAutumnCustomers(
      autumnKey,
      paidPlanIds,
    )
    customers = allCustomers.filter(
      (customer) => customer.env === options.environment,
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
      subscriptionsCancelled: 0,
    },
    customers: [],
  }

  for (const [index, customer] of customers.entries()) {
    const subscriptions = activeAutumnSubscriptions(customer, paidPlanIds)

    console.log(
      `[autumn-cancel] ${index + 1}/${customers.length} ${customer.id} (${subscriptions.length} paid Autumn subscription(s))`,
    )
    report.customers.push(
      await processCustomer({
        autumnKey,
        customer,
        paidPlanIds,
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

  if (report.summary.customersFailed > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`[autumn-cancel] fatal: ${errorMessage(error)}`)
  process.exitCode = 1
})
