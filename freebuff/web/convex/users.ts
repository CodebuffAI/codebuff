import { v } from 'convex/values'
import { internal } from './_generated/api'
import { Doc, Id } from './_generated/dataModel'
import {
  ActionCtx,
  internalMutation,
  internalQuery,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from './_generated/server'
import {
  allUsers,
  usersByRole,
  usersByTier,
  usersByDay,
} from './aggregates/admin_aggregates'

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

async function getProjectMembershipCount(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
) {
  return (
    await ctx.db
      .query('project_member')
      .withIndex('by_user', (q) => q.eq('user', userId))
      .collect()
  ).length
}

async function resolveUserByFreebuffIdOrEmail(
  ctx: QueryCtx | MutationCtx,
  args: {
    freebuffUserId: string
    email?: string
  },
) {
  const userByFreebuffId = await ctx.db
    .query('users')
    .withIndex('by_freebuff_user_id', (q) =>
      q.eq('freebuff_user_id', args.freebuffUserId),
    )
    .unique()

  const emailUsers = args.email
    ? await ctx.db
        .query('users')
        .withIndex('by_email', (q) =>
          q.eq('email', normalizeEmail(args.email!)),
        )
        .collect()
    : []

  const candidates = [
    ...(userByFreebuffId ? [userByFreebuffId] : []),
    ...emailUsers.filter((user) => user._id !== userByFreebuffId?._id),
  ]

  if (candidates.length === 0) {
    return { user: null, userByFreebuffId }
  }

  const scoredCandidates = await Promise.all(
    candidates.map(async (user) => ({
      user,
      projectMembershipCount: await getProjectMembershipCount(ctx, user._id),
    })),
  )

  scoredCandidates.sort((a, b) => {
    if (b.projectMembershipCount !== a.projectMembershipCount) {
      return b.projectMembershipCount - a.projectMembershipCount
    }

    if (a.user._id === userByFreebuffId?._id) return -1
    if (b.user._id === userByFreebuffId?._id) return 1
    return b.user._creationTime - a.user._creationTime
  })

  return { user: scoredCandidates[0].user, userByFreebuffId }
}

export const get = internalQuery({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId)
  },
})

export const upsertCodexAuthFingerprintInternal = internalMutation({
  args: {
    userId: v.id('users'),
    codexAuthFingerprint: v.optional(v.string()),
    codexAuthEncryptedPayload: v.optional(v.string()),
    codexAuthEncryptionVersion: v.optional(v.number()),
    codexAuthMode: v.optional(v.string()),
    codexAuthLastRefresh: v.optional(v.string()),
    codexAuthUpdatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      codex_auth_fingerprint: args.codexAuthFingerprint,
      codex_auth_encrypted_payload: args.codexAuthEncryptedPayload,
      codex_auth_encryption_version: args.codexAuthEncryptionVersion,
      codex_auth_mode: args.codexAuthMode,
      codex_auth_last_refresh: args.codexAuthLastRefresh,
      codex_auth_updated_at: args.codexAuthUpdatedAt,
    })
  },
})

export const getOrCreateSignedInUser = mutation({
  args: {
    referralCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await signedInUser(ctx, args.referralCode)
  },
})

export const signedInUser = async (ctx: MutationCtx, referralCode?: string) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error('Called storeUser without authentication present')
  }

  const email = identity.email
  if (!email) {
    throw new Error('User has no email')
  }
  const normalizedEmail = normalizeEmail(email)
  const freebuffUserId = identity.subject

  const { user, userByFreebuffId } = await resolveUserByFreebuffIdOrEmail(ctx, {
    freebuffUserId,
    email: normalizedEmail,
  })

  if (user !== null) {
    if (userByFreebuffId && userByFreebuffId._id !== user._id) {
      await ctx.db.patch(userByFreebuffId._id, {
        freebuff_user_id: undefined,
      })
    }

    const patchData: {
      name?: string
      email?: string
      profile_image?: string
      freebuff_user_id?: string
    } = {}

    if (user.freebuff_user_id !== freebuffUserId) {
      patchData.freebuff_user_id = freebuffUserId
    }

    // If we've seen this identity before but the name has changed, patch the value.
    if (typeof identity.name === 'string' && user.name !== identity.name) {
      patchData.name = identity.name
    }

    if (
      typeof identity.pictureUrl === 'string' &&
      user.profile_image !== identity.pictureUrl
    ) {
      patchData.profile_image = identity.pictureUrl
    }

    if (user.email !== normalizedEmail) {
      const existingUserWithEmail = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', normalizedEmail))
        .first()

      if (existingUserWithEmail && existingUserWithEmail._id !== user._id) {
        throw new Error('An account with this email already exists')
      }

      patchData.email = normalizedEmail
    }

    if (Object.keys(patchData).length > 0) {
      await ctx.db.patch(user._id, patchData)
    }

    return user._id
  }

  // Check if referral code is valid
  let validReferralCode: string | undefined
  let referrerUserId: Id<'users'> | undefined
  if (referralCode) {
    const referralRecord = await ctx.db
      .query('referral_codes')
      .withIndex('by_code', (q) => q.eq('code', referralCode))
      .filter((q) => q.eq(q.field('active'), true))
      .unique()

    if (referralRecord) {
      // Update the uses count
      await ctx.db.patch(referralRecord._id, {
        uses_count: referralRecord.uses_count + 1,
      })
      validReferralCode = referralCode
      referrerUserId = referralRecord.owner
    }
  }

  // If it's a new identity, create a new `User`.
  const newUserId = await ctx.db.insert('users', {
    name: identity.name ?? '<Anonymous>',
    clerk_id: freebuffUserId,
    freebuff_user_id: freebuffUserId,
    profile_image: identity.pictureUrl,
    email: normalizedEmail,
    referral_code: validReferralCode,
  })

  // Update aggregates for new user
  const newUser = await ctx.db.get(newUserId)
  if (newUser) {
    await allUsers.insert(ctx, newUser)
    await usersByRole.insert(ctx, newUser)
    await usersByTier.insert(ctx, newUser)
    await usersByDay.insert(ctx, newUser)
  }

  // Every new user gets one free spin.
  await ctx.scheduler.runAfter(0, internal.earn.internalGrantWelcomeSpin, {
    userId: newUserId,
  })

  await ctx.scheduler.runAfter(0, internal.email.sendWelcomeEmailInternal, {
    userId: newUserId,
  })

  // Grant a referral spin to the referrer if a valid referral code was used.
  if (validReferralCode && referrerUserId) {
    await ctx.scheduler.runAfter(0, internal.earn.internalGrantReferralSpin, {
      userId: referrerUserId,
      referredUserId: newUserId,
      referralCode: validReferralCode,
    })
  }

  //return await ctx.db.get(newUserId);
  return newUserId
}

// Internal cacheable version - accepts Freebuff user id to enable caching
export const viewerInternal = internalQuery({
  args: {
    freebuffUserId: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await resolveUserByFreebuffIdOrEmail(ctx, args)
    return user
  },
})

export const viewer = query({
  handler: async (ctx): Promise<Doc<'users'> | null> => {
    // Get JWT identity once
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return null
    }

    // Delegate to internal cached version, falling back to email for legacy
    // Clerk-era users until the next mutation patches freebuff_user_id.
    return await ctx.runQuery(internal.users.viewerInternal, {
      freebuffUserId: identity.subject,
      email: identity.email,
    })
  },
})

export const getUserByFreebuffUserId = internalQuery({
  args: {
    freebuffUserId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('users')
      .withIndex('by_freebuff_user_id', (q) =>
        q.eq('freebuff_user_id', args.freebuffUserId),
      )
      .unique()
  },
})

export const getUserByFreebuffUserIdOrEmail = internalQuery({
  args: {
    freebuffUserId: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await resolveUserByFreebuffIdOrEmail(ctx, args)
    return user
  },
})

export const getUserByClerkId = internalQuery({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerk_id', args.clerkId))
      .unique()
  },
})

export const getUserByEmail = internalQuery({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', normalizeEmail(args.email)))
      .unique()
  },
})

/**
 * Get the user from the database and require authentication
 * @param ctx
 * @returns
 */
export async function getAuthUser(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<Doc<'users'> | null> {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity) {
    return null
  }

  const user: Doc<'users'> | null = await ctx.runQuery(
    internal.users.getUserByFreebuffUserIdOrEmail,
    {
      freebuffUserId: identity.subject,
      email: identity.email,
    },
  )

  return user
}

// Mutation to set onboarding_completed to true for the current user
export const setOnboardingCompleted = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }
    await ctx.db.patch(user._id, { onboarding_completed: true })
    return true
  },
})

// Mutation to record interest in hiring developers
export const recordHiringInterest = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }
    await ctx.db.patch(user._id, { interested_in_hiring: true })
    return true
  },
})

// Mutation to submit hiring interest form
export const submitHiringInterestForm = mutation({
  args: {
    companyName: v.string(),
    whatBuilding: v.string(),
    budget: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }
    await ctx.db.insert('hiring_interest_forms', {
      userId: user._id,
      formType: 'hiring',
      companyName: args.companyName,
      whatBuilding: args.whatBuilding,
      budget: args.budget,
      phoneNumber: args.phoneNumber,
      submittedAt: Date.now(),
    })
    return true
  },
})

// Mutation to submit developer application form
export const submitDeveloperApplicationForm = mutation({
  args: {
    name: v.string(),
    linkedin: v.string(),
    github: v.string(),
    pitch: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    // Check if form already exists
    const existingForm = await ctx.db
      .query('hiring_interest_forms')
      .withIndex('by_user_and_form_type', (q) =>
        q.eq('userId', user._id).eq('formType', 'developer_application'),
      )
      .first()

    if (existingForm) {
      // Update existing form
      await ctx.db.patch(existingForm._id, {
        name: args.name,
        linkedin: args.linkedin,
        github: args.github,
        pitch: args.pitch,
        phoneNumber: args.phoneNumber,
        submittedAt: Date.now(),
      })
    } else {
      // Insert new form
      await ctx.db.insert('hiring_interest_forms', {
        userId: user._id,
        formType: 'developer_application',
        name: args.name,
        linkedin: args.linkedin,
        github: args.github,
        pitch: args.pitch,
        phoneNumber: args.phoneNumber,
        submittedAt: Date.now(),
      })
    }
    return true
  },
})

// Mutation to submit enterprise interest form
export const submitEnterpriseInterestForm = mutation({
  args: {
    companyName: v.string(),
    whatBuilding: v.string(),
    budget: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    // Check if form already exists
    const existingForm = await ctx.db
      .query('hiring_interest_forms')
      .withIndex('by_user_and_form_type', (q) =>
        q.eq('userId', user._id).eq('formType', 'enterprise'),
      )
      .first()

    if (existingForm) {
      // Update existing form
      await ctx.db.patch(existingForm._id, {
        companyName: args.companyName,
        whatBuilding: args.whatBuilding,
        budget: args.budget,
        phoneNumber: args.phoneNumber,
        submittedAt: Date.now(),
      })
    } else {
      // Insert new form
      await ctx.db.insert('hiring_interest_forms', {
        userId: user._id,
        formType: 'enterprise',
        companyName: args.companyName,
        whatBuilding: args.whatBuilding,
        budget: args.budget,
        phoneNumber: args.phoneNumber,
        submittedAt: Date.now(),
      })
    }
    return true
  },
})

/**
 * Get a form by type for the current authenticated user
 */
export const getFormByType = query({
  args: {
    formType: v.union(
      v.literal('hiring'),
      v.literal('developer_application'),
      v.literal('enterprise'),
    ),
  },
  returns: v.union(
    v.object({
      _id: v.id('hiring_interest_forms'),
      _creationTime: v.number(),
      userId: v.id('users'),
      formType: v.union(
        v.literal('hiring'),
        v.literal('developer_application'),
        v.literal('enterprise'),
      ),
      companyName: v.optional(v.string()),
      whatBuilding: v.optional(v.string()),
      budget: v.optional(v.string()),
      phoneNumber: v.optional(v.string()),
      name: v.optional(v.string()),
      linkedin: v.optional(v.string()),
      github: v.optional(v.string()),
      pitch: v.optional(v.string()),
      submittedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx)
    if (!user) {
      return null
    }

    const form = await ctx.db
      .query('hiring_interest_forms')
      .withIndex('by_user_and_form_type', (q) =>
        q.eq('userId', user._id).eq('formType', args.formType),
      )
      .first()

    return form ?? null
  },
})

// Returns the total number of users (using aggregates for real-time counting)
export const getUserCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    // Use aggregates for efficient, real-time counting
    return await allUsers.count(ctx, { bounds: {} })
  },
})
