import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '../../auth/[...nextauth]/auth-options'

export const runtime = 'nodejs'

export type LinkedProvidersData = {
  /** OAuth providers currently linked to the signed-in user (e.g. ['github']). */
  providers: string[]
}

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db
    .select({ provider: schema.account.provider })
    .from(schema.account)
    .where(eq(schema.account.userId, session.user.id))

  const providers = Array.from(new Set(rows.map((r) => r.provider)))
  return NextResponse.json({ providers } satisfies LinkedProvidersData)
}
