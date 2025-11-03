import { getCachedAgents, type AgentData } from '@/server/agents-data'

export const getAgentsData = async (): Promise<AgentData[]> => {
  const suppressErrors =
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.CI === 'true'

  try {
    return await getCachedAgents()
  } catch (error) {
    if (!suppressErrors) {
      console.error('Error fetching agents data:', error)
    }

    if (suppressErrors) {
      console.warn('Skipping agents data fetch during static build.')
    }

    return []
  }
}

export async function revalidateAgentsData() {
  const { revalidateTag } = await import('next/cache')
  revalidateTag('agents')
  revalidateTag('store')
  revalidateTag('api')
}
