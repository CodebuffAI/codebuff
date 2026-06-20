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
import { applyUserAuthMetricDelta } from './admin_platform_metrics'

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
    codexOauthRevoked: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const before = await ctx.db.get(args.userId)
    await ctx.db.patch(args.userId, {
      codex_auth_fingerprint: args.codexAuthFingerprint,
      codex_auth_encrypted_payload: args.codexAuthEncryptedPayload,
      codex_auth_encryption_version: args.codexAuthEncryptionVersion,
      codex_auth_mode: args.codexAuthMode,
      codex_auth_last_refresh: args.codexAuthLastRefresh,
      codex_auth_updated_at: args.codexAuthUpdatedAt,
      ...(args.codexOauthRevoked !== undefined
        ? { codex_oauth_revoked: args.codexOauthRevoked }
        : {}),
    })
    const after = await ctx.db.get(args.userId)
    if (before && after) {
      await applyUserAuthMetricDelta(ctx, before, after)
    }
  },
})

// Per-credential field names used for storing encrypted BYOK secrets.
// Driven by `kind` so we don't need a setter per credential.
const BYOK_FIELDS = {
  openai: {
    encrypted: 'gpt_openai_api_key_encrypted',
    version: 'gpt_openai_api_key_encryption_version',
    updatedAt: 'gpt_openai_api_key_updated_at',
  },
  anthropic: {
    encrypted: 'claude_anthropic_api_key_encrypted',
    version: 'claude_anthropic_api_key_encryption_version',
    updatedAt: 'claude_anthropic_api_key_updated_at',
  },
  bedrock: {
    encrypted: 'claude_bedrock_bearer_token_encrypted',
    version: 'claude_bedrock_bearer_token_encryption_version',
    updatedAt: 'claude_bedrock_bearer_token_updated_at',
  },
} as const

export const patchByokSecretInternal = internalMutation({
  args: {
    userId: v.id('users'),
    kind: v.union(
      v.literal('openai'),
      v.literal('anthropic'),
      v.literal('bedrock'),
    ),
    encrypted: v.string(),
    version: v.number(),
  },
  handler: async (ctx, args) => {
    const before = await ctx.db.get(args.userId)
    const f = BYOK_FIELDS[args.kind]
    await ctx.db.patch(args.userId, {
      [f.encrypted]: args.encrypted,
      [f.version]: args.version,
      [f.updatedAt]: Date.now(),
    } as any)
    const after = await ctx.db.get(args.userId)
    if (before && after) {
      await applyUserAuthMetricDelta(ctx, before, after)
    }
  },
})

export const setCodexOauthRevokedInternal = internalMutation({
  args: {
    userId: v.id('users'),
    revoked: v.boolean(),
  },
  handler: async (ctx, args) => {
    const before = await ctx.db.get(args.userId)
    await ctx.db.patch(args.userId, {
      codex_oauth_revoked: args.revoked,
    })
    const after = await ctx.db.get(args.userId)
    if (before && after) {
      await applyUserAuthMetricDelta(ctx, before, after)
    }
  },
})

export const getCliByokSettings = query({
  args: {},
  returns: v.union(
    v.object({
      gptAuthMethod: v.union(v.literal('oauth'), v.literal('byok')),
      hasCodexOauth: v.boolean(),
      gptModelPreference: v.string(),
      hasOpenAiApiKey: v.boolean(),
      openAiApiKeyUpdatedAt: v.optional(v.number()),
      claudeProviderPreference: v.union(
        v.literal('anthropic'),
        v.literal('bedrock'),
      ),
      claudeModelPreference: v.string(),
      hasAnthropicApiKey: v.boolean(),
      anthropicApiKeyUpdatedAt: v.optional(v.number()),
      hasBedrockBearerToken: v.boolean(),
      bedrockBearerTokenUpdatedAt: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const user = await getAuthUser(ctx)
    if (!user) {
      return null
    }

    return {
      gptAuthMethod: user.gpt_auth_method ?? 'oauth',
      hasCodexOauth:
        user.codex_auth_mode === 'chatgpt' && user.codex_oauth_revoked !== true,
      gptModelPreference: user.gpt_model_preference ?? 'default',
      hasOpenAiApiKey: !!user.gpt_openai_api_key_encrypted,
      openAiApiKeyUpdatedAt: user.gpt_openai_api_key_updated_at,
      claudeProviderPreference: user.claude_provider_preference ?? 'bedrock',
      claudeModelPreference: user.claude_model_preference ?? 'default',
      hasAnthropicApiKey: !!user.claude_anthropic_api_key_encrypted,
      anthropicApiKeyUpdatedAt: user.claude_anthropic_api_key_updated_at,
      hasBedrockBearerToken: !!user.claude_bedrock_bearer_token_encrypted,
      bedrockBearerTokenUpdatedAt: user.claude_bedrock_bearer_token_updated_at,
    }
  },
})

const CLI_PREFERENCE_VALUES = {
  gpt_auth_method: ['oauth', 'byok'],
  claude_provider_preference: ['anthropic', 'bedrock'],
  // Kept only for backward compatibility with older clients. Codex and Claude
  // Code runs now use the CLI default model instead of exposing stale model IDs.
  gpt_model_preference: ['default'],
  claude_model_preference: ['default'],
} as const

export const setCliPreference = mutation({
  args: {
    key: v.union(
      v.literal('gpt_auth_method'),
      v.literal('claude_provider_preference'),
      v.literal('gpt_model_preference'),
      v.literal('claude_model_preference'),
    ),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }
    const allowedValues = CLI_PREFERENCE_VALUES[args.key]
    if (!(allowedValues as readonly string[]).includes(args.value)) {
      throw new Error(`Invalid value for ${args.key}`)
    }
    const before = user
    await ctx.db.patch(user._id, { [args.key]: args.value } as any)
    const after = await ctx.db.get(user._id)
    if (after && args.key === 'gpt_auth_method') {
      await applyUserAuthMetricDelta(ctx, before, after)
    }
    return { success: true }
  },
})

export const clearCodexOauthAuth = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    const before = user
    await ctx.db.patch(user._id, {
      codex_auth_fingerprint: undefined,
      codex_auth_encrypted_payload: undefined,
      codex_auth_encryption_version: undefined,
      codex_auth_mode: undefined,
      codex_auth_last_refresh: undefined,
      codex_auth_updated_at: undefined,
      codex_oauth_revoked: true,
    })
    const after = await ctx.db.get(user._id)
    if (after) {
      await applyUserAuthMetricDelta(ctx, before, after)
    }

    return { success: true }
  },
})

export const clearCliByokCredential = mutation({
  args: {
    credential: v.union(
      v.literal('openai'),
      v.literal('anthropic'),
      v.literal('bedrock'),
    ),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    const before = user

    if (args.credential === 'openai') {
      await ctx.db.patch(user._id, {
        gpt_openai_api_key_encrypted: undefined,
        gpt_openai_api_key_encryption_version: undefined,
        gpt_openai_api_key_updated_at: undefined,
      })
    } else if (args.credential === 'anthropic') {
      await ctx.db.patch(user._id, {
        claude_anthropic_api_key_encrypted: undefined,
        claude_anthropic_api_key_encryption_version: undefined,
        claude_anthropic_api_key_updated_at: undefined,
      })
    } else {
      await ctx.db.patch(user._id, {
        claude_bedrock_bearer_token_encrypted: undefined,
        claude_bedrock_bearer_token_encryption_version: undefined,
        claude_bedrock_bearer_token_updated_at: undefined,
      })
    }

    const after = await ctx.db.get(user._id)
    if (after) {
      await applyUserAuthMetricDelta(ctx, before, after)
    }

    return { success: true }
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

  // Web referral score claim minted by the convex-token route from the
  // shared Postgres referral ledger. Synced onto the user doc so rate limits
  // and perks (which may look up users other than the caller, e.g. project
  // owners) can read it without auth context.
  const claims = identity as Record<string, unknown>
  const webReferralScore =
    typeof claims.web_referral_score === 'number'
      ? claims.web_referral_score
      : undefined

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
      qualified_referral_count?: number
    } = {}

    if (user.freebuff_user_id !== freebuffUserId) {
      patchData.freebuff_user_id = freebuffUserId
    }

    if (
      webReferralScore !== undefined &&
      user.qualified_referral_count !== webReferralScore
    ) {
      patchData.qualified_referral_count = webReferralScore
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

  // If it's a new identity, create a new `User`. The web referral ledger
  // itself lives in Postgres (shared with the CLI program); the score claim
  // is just denormalized here for tier-scaled limits and perks.
  const newUserId = await ctx.db.insert('users', {
    name: identity.name ?? '<Anonymous>',
    clerk_id: freebuffUserId,
    freebuff_user_id: freebuffUserId,
    profile_image: identity.pictureUrl,
    email: normalizedEmail,
    referral_code: validReferralCode,
    qualified_referral_count: webReferralScore,
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
