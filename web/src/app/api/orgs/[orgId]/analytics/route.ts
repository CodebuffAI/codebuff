import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq, and, desc, gte, sql } from 'drizzle-orm'

interface RouteParams {
  params: { orgId: string }
}

interface AnalyticsData {
  topUsers: Array<{
    user_id: string
    user_name: string
    credits_used: number
  }>
  topRepositories: Array<{
    repository_url: string
    credits_used: number
  }>
  dailyUsage: Array<{
    date: string
    credits_used: number
  }>
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<AnalyticsData | { error: string }>> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = params

    // Check if user is a member of this organization
    const membership = await db
      .select({ role: schema.orgMember.role })
      .from(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          eq(schema.orgMember.user_id, session.user.id)
        )
      )
      .limit(1)

    if (membership.length === 0) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get current month start
    const now = new Date()
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // Get top users by credit usage this month
    const topUsers = await db
      .select({
        user_id: schema.message.user_id,
        user_name: schema.user.name,
        credits_used: sql<number>`SUM(${schema.message.credits})`,
      })
      .from(schema.message)
      .innerJoin(schema.user, eq(schema.message.user_id, schema.user.id))
      .where(
        and(
          eq(schema.message.org_id, orgId),
          gte(schema.message.finished_at, currentMonthStart)
        )
      )
      .groupBy(schema.message.user_id, schema.user.name)
      .orderBy(desc(sql`SUM(${schema.message.credits})`))
      .limit(10)

    // Get top repositories by credit usage this month
    const topRepositories = await db
      .select({
        repository_url: schema.message.repo_url,
        credits_used: sql<number>`SUM(${schema.message.credits})`,
      })
      .from(schema.message)
      .where(
        and(
          eq(schema.message.org_id, orgId),
          gte(schema.message.finished_at, currentMonthStart)
        )
      )
      .groupBy(schema.message.repo_url)
      .orderBy(desc(sql`SUM(${schema.message.credits})`))
      .limit(10)

    // Get daily usage for the last 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const dailyUsage = await db
      .select({
        date: sql<string>`DATE(${schema.message.finished_at})`,
        credits_used: sql<number>`SUM(${schema.message.credits})`,
      })
      .from(schema.message)
      .where(
        and(
          eq(schema.message.org_id, orgId),
          gte(schema.message.finished_at, thirtyDaysAgo)
        )
      )
      .groupBy(sql`DATE(${schema.message.finished_at})`)
      .orderBy(sql`DATE(${schema.message.finished_at})`)

    return NextResponse.json({
      topUsers: topUsers.map(user => ({
        user_id: user.user_id!,
        user_name: user.user_name || 'Unknown',
        credits_used: user.credits_used,
      })),
      topRepositories: topRepositories.map(repo => ({
        repository_url: repo.repository_url || '',
        credits_used: repo.credits_used,
      })),
      dailyUsage: dailyUsage.map(usage => ({
        date: usage.date,
        credits_used: usage.credits_used,
      })),
    })
  } catch (error) {
    console.error('Error fetching organization analytics:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
