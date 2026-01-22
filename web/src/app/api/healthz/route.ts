import { getAgentCount } from '@/server/agents-data'
import { getHealthz } from './_get'

export const GET = async () => {
  return getHealthz({ getAgentCount })
}
