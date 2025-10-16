import type { NextRequest } from 'next/server'

import { meGet } from '@/api/v1/me'
import { getUserInfoFromApiKey } from '@/db/user'

export async function GET(req: NextRequest) {
  return meGet({ req, getUserInfoFromApiKey })
}
