import { v } from 'convex/values'
import { mutation } from '../_generated/server'
import { getAuthUser } from '../users'

export const submitCloudBetaSurvey = mutation({
  args: {
    recordedName: v.string(),
    recordedEmail: v.string(),
    productDirection: v.union(
      v.literal('combined'),
      v.literal('separate'),
      v.literal('unsure'),
    ),
    improvement: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    await ctx.db.insert('cloud_beta_feedback', {
      userId: user._id,
      recordedName: args.recordedName,
      recordedEmail: args.recordedEmail,
      productDirection: args.productDirection,
      improvement: args.improvement,
      submittedAt: Date.now(),
    })

    return null
  },
})
