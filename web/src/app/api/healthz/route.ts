import { getHealthz } from './_get'

import { getAgentCount } from '@/server/agents-data'

export const GET = async () => {
  return getHealthz({ getAgentCount })
}
