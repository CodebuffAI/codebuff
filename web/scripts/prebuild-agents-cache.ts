/**
 * Pre-build cache warming for agents data
 * This runs during the build process to populate the cache before deployment
 */

import { getCachedAgents } from '../src/server/agents-data'

async function main() {
  console.log('[Prebuild] Starting agents cache warm-up...')

  try {
    const startTime = Date.now()
    const agents = await getCachedAgents()
    const duration = Date.now() - startTime

    console.log(`[Prebuild] Successfully cached ${agents.length} agents in ${duration}ms`)
    console.log('[Prebuild] Cache is ready for production deployment')

    process.exit(0)
  } catch (error) {
    console.error('[Prebuild] Failed to warm agents cache:', error)
    // Don't fail the build, but log the error
    console.error('[Prebuild] WARNING: App will fetch agents on first request')
    process.exit(0)
  }
}

main()
