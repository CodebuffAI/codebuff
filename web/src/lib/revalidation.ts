'use server'

import { revalidatePath, revalidateTag } from 'next/cache'

/**
 * Revalidate all agent-related data across the application
 * Use this when agent data is updated via admin actions or webhooks
 */
export async function revalidateAgents() {
  // Revalidate specific pages
  revalidatePath('/store')
  revalidatePath('/api/agents')

  // Revalidate by tags (affects all cached data with these tags).
  // Next 16 requires a second argument; { expire: 0 } preserves the pre-16
  // behavior of expiring immediately (admin actions/webhooks need fresh data).
  revalidateTag('agents', { expire: 0 })
  revalidateTag('store', { expire: 0 })
  revalidateTag('api', { expire: 0 })
}

/**
 * Revalidate a specific agent's data
 * Use this when a single agent is updated
 */
export async function revalidateAgent(publisherId: string, agentId: string) {
  // Revalidate specific agent pages
  revalidatePath(`/publishers/${publisherId}/agents/${agentId}`)
  revalidatePath(`/publishers/${publisherId}`)

  // Also revalidate the store to reflect changes
  revalidatePath('/store')
  revalidateTag('agents', { expire: 0 })
}

/**
 * Revalidate publisher-related data
 * Use this when publisher information is updated
 */
export async function revalidatePublisher(publisherId: string) {
  revalidatePath(`/publishers/${publisherId}`)
  revalidatePath('/publishers')
  revalidateTag('publishers', { expire: 0 })

  // Also revalidate agents since publisher info appears in agent cards
  revalidateTag('agents', { expire: 0 })
}
