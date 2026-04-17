import { NextResponse } from 'next/server'

import type { FireworksHealthSnapshot } from '@/server/fireworks-monitor/types'

export interface FireworksHealthDeps {
  getSnapshot: () => FireworksHealthSnapshot
  checkAdminAuth: () => Promise<unknown>
}

export async function getFireworksHealth({
  getSnapshot,
  checkAdminAuth,
}: FireworksHealthDeps) {
  const authResult = await checkAdminAuth()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const snapshot = getSnapshot()
  const httpStatus = snapshot.overall === 'unhealthy' ? 503 : 200
  return NextResponse.json(snapshot, { status: httpStatus })
}
