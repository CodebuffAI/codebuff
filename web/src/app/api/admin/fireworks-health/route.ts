import { getFireworksHealth } from './_get'

import { checkAdminAuth } from '@/lib/admin-auth'
import { getFireworksHealthSnapshot } from '@/server/fireworks-monitor/monitor'

export const GET = () => {
  return getFireworksHealth({
    getSnapshot: getFireworksHealthSnapshot,
    checkAdminAuth,
  })
}
