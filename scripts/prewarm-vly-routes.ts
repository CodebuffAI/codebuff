#!/usr/bin/env bun

export {}

const baseUrl = (
  process.env.VLY_PREWARM_BASE_URL ??
  process.env.NEXT_PUBLIC_FREEBUFF_URL ??
  'http://localhost:3000'
).replace(/\/+$/, '')

const sampleProjectId = process.env.VLY_PREWARM_PROJECT_ID ?? 'red-colts-tie'
const sampleUserId = process.env.VLY_PREWARM_USER_ID ?? 'sample-user'
const sampleInviteToken = process.env.VLY_PREWARM_INVITE_TOKEN ?? 'sample-token'

const routes = [
  '/',
  '/login',
  '/get-started',
  '/live',
  '/onboard',
  '/api/web/.well-known/jwks.json',
  '/web',
  '/web/dashboard',
  '/web/dashboard/preferences',
  '/web/community',
  '/web/community/explore',
  '/web/community/leaderboard',
  `/web/community/profile/${sampleUserId}`,
  `/web/community/project/${sampleProjectId}`,
  '/web/contact',
  '/web/earn',
  '/web/earn/admin',
  '/web/pricing',
  '/web/referrals',
  '/web/app-support',
  '/web/devtools',
  '/web/maintenance',
  '/web/migrating',
  `/web/invite/${sampleInviteToken}`,
  `/web/project/${sampleProjectId}`,
  `/web/project/${sampleProjectId}/migrating`,
  '/web/admin',
  '/web/admin/referrals',
  '/web/admin/referral-lookup',
  '/web/admin/resource-usage',
  '/web/admin/email-blasts',
]

const startedAt = Date.now()
let okCount = 0
let failedCount = 0

console.log(`[vly-prewarm] warming ${routes.length} routes at ${baseUrl}`)

for (const route of routes) {
  const url = `${baseUrl}${route}`
  const routeStartedAt = Date.now()
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: {
        Accept: 'text/html,application/json',
      },
    })
    const elapsed = Date.now() - routeStartedAt
    okCount += 1
    console.log(
      `[vly-prewarm] ${response.status.toString().padStart(3)} ${route} ${elapsed}ms`,
    )
  } catch (error) {
    const elapsed = Date.now() - routeStartedAt
    failedCount += 1
    console.warn(
      `[vly-prewarm] ERR ${route} ${elapsed}ms ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

const elapsed = Date.now() - startedAt
console.log(
  `[vly-prewarm] done: ${okCount} ok, ${failedCount} failed, ${elapsed}ms`,
)

if (failedCount > 0) {
  process.exitCode = 1
}
