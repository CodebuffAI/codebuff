import { Row, run, SupabaseClient } from './utils'
import { PrivateUser, User } from 'common/user'

export async function getUserForStaticProps(
  db: SupabaseClient,
  username: string
) {
  const { data } = await run(db.from('users').select().eq('username', username))
  return convertUser(data[0] ?? null)
}

// assumes logged in
export async function getUserAndPrivateUserForStaticProps(
  db: SupabaseClient,
  userId: string
) {
  const [user, privateUser] = await Promise.all([
    run(db.from('users').select().eq('id', userId)),
    run(db.from('private_users').select().eq('id', userId)),
  ])
  return {
    user: convertUser(user.data[0]),
    privateUser: convertPrivateUser(privateUser.data[0]),
  }
}

export function convertUser(row: Row<'users'>): User
export function convertUser(row: Row<'users'> | null): User | null {
  if (!row) return null

  return {
    ...(row.data as any),
    id: row.id,
    username: row.username,
    name: row.name,
    balance: row.balance,
    cashBalance: row.cash_balance,
    spiceBalance: row.spice_balance,
    totalDeposits: row.total_deposits,
    totalCashDeposits: row.total_cash_deposits,
    resolvedProfitAdjustment: row.resolved_profit_adjustment,
  } as User
}

export function convertPrivateUser(row: Row<'private_users'>): PrivateUser
export function convertPrivateUser(
  row: Row<'private_users'> | null
): PrivateUser | null {
  if (!row) return null
  return row.data as PrivateUser
}
