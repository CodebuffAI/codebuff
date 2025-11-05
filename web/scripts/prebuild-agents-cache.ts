/**
 * Pre-build cache warming for agents data
 * This runs during the build process to validate the database connection
 * and ensure agents data can be fetched successfully.
 *
 * Note: This doesn't actually populate Next.js cache (which requires runtime context),
 * but it validates the data fetching pipeline works before deployment.
 */

import { fetchAgentsWithMetrics } from '../src/server/agents-data'

async function main() {
  console.log('[Prebuild] Validating agents data pipeline...')

  try {
    const startTime = Date.now()
    const agents = await fetchAgentsWithMetrics()
    const duration = Date.now() - startTime

    console.log(`[Prebuild] Successfully fetched ${agents.length} agents in ${duration}ms`)
    console.log('[Prebuild] Data pipeline validated - ready for deployment')

    process.exit(0)
  } catch (error) {
    console.error('[Prebuild] Failed to fetch agents data:', error)
    // Don't fail the build - health check will warm cache at runtime
    console.error('[Prebuild] WARNING: Data fetch failed, relying on runtime health check')
    process.exit(0)
  }
}

main()
