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

  // Revalidate by tags (affects all cached data with these tags)
  revalidateTag('agents')
  revalidateTag('store')
  revalidateTag('api')
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
  revalidateTag('agents')
}

/**
 * Revalidate publisher-related data
 * Use this when publisher information is updated
 */
export async function revalidatePublisher(publisherId: string) {
  revalidatePath(`/publishers/${publisherId}`)
  revalidatePath('/publishers')
  revalidateTag('publishers')

  // Also revalidate agents since publisher info appears in agent cards
  revalidateTag('agents')
}
