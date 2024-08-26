import * as admin from 'firebase-admin'
import { PrivateUser, User } from 'common/user'
import { randomString } from 'common/util/random'
import { cleanDisplayName, cleanUsername } from 'common/util/clean-username'

import { track } from 'shared/analytics'
import { getDefaultNotificationPreferences } from 'common/user-notification-preferences'
import { removeUndefinedProps } from 'common/util/object'
import { generateAvatarUrl } from 'shared/helpers/generate-and-update-avatar-urls'
import { getStorage } from 'firebase-admin/storage'
import { DEV_CONFIG } from 'common/envs/dev'
import { PROD_CONFIG } from 'common/envs/prod'
import {
  LOVE_DOMAIN,
  LOVE_DOMAIN_ALTERNATE,
  RESERVED_PATHS,
} from 'common/envs/constants'
import { log, isProd, getUser, getUserByUsername } from 'shared/utils'
import { trackSignupFB } from 'shared/fb-analytics'
import {
  getAverageContractEmbedding,
  getAverageGroupEmbedding,
  getDefaultEmbedding,
  normalizeAndAverageVectors,
} from 'shared/helpers/embeddings'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'

import { insert } from 'shared/supabase/utils'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { SignupBonusTxn } from 'common/txn'
import { STARTING_BALANCE } from 'common/economy'
import { ValidatedAPIParams } from 'common/api/schema'
import { APIError } from 'common/api/utils'
import { onCreateUser } from 'shared/helpers/on-create-user'

export const createUserMain = async (
  props: ValidatedAPIParams<'createuser'>,
  userId: string,
  ip: string,
  host: string | undefined
) => {
  const { deviceToken: preDeviceToken, adminToken, visitedContractIds } = props
  const firebaseUser = await admin.auth().getUser(userId)

  const testUserAKAEmailPasswordUser =
    firebaseUser.providerData[0].providerId === 'password'
  if (
    testUserAKAEmailPasswordUser &&
    adminToken !== process.env.TEST_CREATE_USER_KEY
  ) {
    throw new APIError(
      401,
      'Must use correct TEST_CREATE_USER_KEY to create user with email/password'
    )
  }

  log(`Create user from: ${host}`)

  const fromLove =
    (host?.includes('localhost')
      ? process.env.IS_MANIFOLD_LOVE === 'true'
      : host?.includes(LOVE_DOMAIN) || host?.includes(LOVE_DOMAIN_ALTERNATE)) ||
    undefined

  const deviceToken = testUserAKAEmailPasswordUser
    ? randomString() + randomString()
    : preDeviceToken

  const fbUser = await admin.auth().getUser(userId)
  const email = fbUser.email
  const emailName = email?.replace(/@.*$/, '')

  const rawName = fbUser.displayName || emailName || 'User' + randomString(4)
  const name = cleanDisplayName(rawName)

  const bucket = getStorage().bucket(getStorageBucketId())
  const avatarUrl = fbUser.photoURL
    ? fbUser.photoURL
    : await generateAvatarUrl(userId, name, bucket)

  const pg = createSupabaseDirectClient()

  let username = cleanUsername(name)

  // Check username case-insensitive
  const dupes = await pg.one<number>(
    `select count(*) from users where username ilike $1`,
    [username],
    (r) => r.count
  )
  const usernameExists = dupes > 0
  const isReservedName = RESERVED_PATHS.includes(username)
  if (usernameExists || isReservedName) username += randomString(4)

  const { user, privateUser } = await pg.tx(async (tx) => {
    const preexistingUser = await getUser(userId, tx)
    if (preexistingUser)
      throw new APIError(403, 'User already exists', {
        userId: userId,
      })

    // Check exact username to avoid problems with duplicate requests
    const sameNameUser = await getUserByUsername(username, tx)
    if (sameNameUser)
      throw new APIError(403, 'Username already taken', { username })

    // Only undefined prop should be fromLove
    const user: User = removeUndefinedProps({
      id: userId,
      name,
      username,
      avatarUrl,
      balance: 0,
      cashBalance: 0,
      spiceBalance: 0,
      totalDeposits: 0,
      totalCashDeposits: 0,
      createdTime: Date.now(),
      profitCached: { daily: 0, weekly: 0, monthly: 0, allTime: 0 },
      nextLoanCached: 0,
      streakForgiveness: 1,
      shouldShowWelcome: true,
      creatorTraders: { daily: 0, weekly: 0, monthly: 0, allTime: 0 },
      isBannedFromPosting: Boolean(
        (deviceToken && bannedDeviceTokens.includes(deviceToken)) ||
          (ip && bannedIpAddresses.includes(ip))
      ),
      fromLove,
      signupBonusPaid: 0,
      verifiedPhone: testUserAKAEmailPasswordUser,
    })

    const privateUser: PrivateUser = {
      id: userId,
      email,
      initialIpAddress: ip,
      initialDeviceToken: deviceToken,
      notificationPreferences: getDefaultNotificationPreferences(),
      blockedUserIds: [],
      blockedByUserIds: [],
      blockedContractIds: [],
      blockedGroupSlugs: [],
    }

    await insert(tx, 'users', {
      id: user.id,
      name: user.name,
      username: user.username,
      data: user,
    })

    const startingBonusTxn: Omit<
      SignupBonusTxn,
      'id' | 'createdTime' | 'fromId'
    > = {
      fromType: 'BANK',
      toId: user.id,
      toType: 'USER',
      amount: STARTING_BALANCE,
      token: 'M$',
      category: 'SIGNUP_BONUS',
      description: 'Signup bonus',
    }
    await runTxnFromBank(tx, startingBonusTxn)

    await insert(tx, 'private_users', {
      id: privateUser.id,
      data: privateUser,
    })

    return {
      user,
      privateUser,
    }
  })

  log('created user ', { username: user.username, firebaseId: userId })

  const continuation = async () => {
    const pg = createSupabaseDirectClient()
    await track(
      user.id,
      fromLove ? 'create lover' : 'create user',
      { username: user.username },
      { ip }
    )

    await addContractsToSeenMarketsTable(userId, visitedContractIds, pg)
    await upsertNewUserEmbeddings(userId, visitedContractIds, pg)

    if (process.env.FB_ACCESS_TOKEN)
      await trackSignupFB(
        process.env.FB_ACCESS_TOKEN,
        user.id,
        email ?? '',
        ip
      ).catch((e) => log('error fb tracking:', e))
    else log('no FB_ACCESS_TOKEN')
    await onCreateUser(user, privateUser)
  }

  return {
    result: {
      user,
      privateUser,
    },
    continue: continuation,
  }
}

async function addContractsToSeenMarketsTable(
  userId: string,
  visitedContractIds: string[] | undefined,
  pg: SupabaseDirectClient
) {
  if (!visitedContractIds || visitedContractIds.length === 0) return

  await Promise.all(
    visitedContractIds.map((contractId) =>
      pg.none(
        `insert into user_contract_views (user_id, contract_id, page_views, last_page_view_ts)
            values ($1, $2, 1, now())`,
        [userId, contractId]
      )
    )
  )
}

async function upsertNewUserEmbeddings(
  userId: string,
  visitedContractIds: string[] | undefined,
  pg: SupabaseDirectClient
): Promise<void> {
  log('Averaging contract embeddings for user ' + userId, {
    visitedContractIds,
  })
  let embed = await getAverageContractEmbedding(pg, visitedContractIds)
  if (!embed) embed = await getDefaultEmbedding(pg)
  const groupIds =
    visitedContractIds && visitedContractIds.length > 0
      ? await pg.map(
          `select group_id
        from group_contracts
        where contract_id = any($1)`,
          [visitedContractIds],
          (r) => r.group_id
        )
      : []
  log('Averaging group embeddings for user ' + userId, { groupIds })
  const groupEmbed = await getAverageGroupEmbedding(pg, groupIds)
  if (groupEmbed) {
    embed = normalizeAndAverageVectors([embed, embed, groupEmbed])
  }

  await pg.none(
    `insert into user_embeddings (user_id, interest_embedding, contract_view_embedding)
            values ($1, $2, $2)
            on conflict (user_id)
            do update set
            interest_embedding = $2,
            contract_view_embedding = $2
            `,
    [userId, embed]
  )
}

function getStorageBucketId() {
  return isProd()
    ? PROD_CONFIG.firebaseConfig.storageBucket
    : DEV_CONFIG.firebaseConfig.storageBucket
}

// Automatically ban users with these device tokens or ip addresses.
const bannedDeviceTokens = [
  'fa807d664415',
  'dcf208a11839',
  'bbf18707c15d',
  '4c2d15a6cc0c',
  '0da6b4ea79d3',
]
const bannedIpAddresses: string[] = [
  '24.176.214.250',
  '2607:fb90:bd95:dbcd:ac39:6c97:4e35:3fed',
  '2607:fb91:389:ddd0:ac39:8397:4e57:f060',
  '2607:fb90:ed9a:4c8f:ac39:cf57:4edd:4027',
  '2607:fb90:bd36:517a:ac39:6c91:812c:6328',
]
