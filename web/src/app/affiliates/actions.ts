'use server'

import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { AFFILIATE_USER_REFFERAL_LIMIT } from 'common/constants'

const RESERVED_HANDLES = [
  'api',
  'docs',
  'hackathon',
  'login',
  'onboard',
  'payment-change',
  'payment-success',
  'pricing',
  'privacy-policy',
  'referrals',
  'subscription',
  'terms-of-service',
  'usage',
  'affiliates',
  'discord',
  'ingest',
  'admin',
  'auth',
  'user',
  'profile',
  'settings',
  'support',
  'help',
  'contact',
  'root',
  'codebuff',
  'manicode',
  'status',
  'healthz',
].map((h) => h.toLowerCase())

const HandleSchema = z
  .string()
  .min(3, 'Handle must be at least 3 characters long.')
  .max(20, 'Handle cannot be longer than 20 characters.')
  .regex(
    /^[a-zA-Z0-9_]+$/,
    'Handle can only contain letters, numbers, and underscores.'
  )
  .transform((str) => str.toLowerCase())
  .refine((handle) => !RESERVED_HANDLES.includes(handle), {
    message: 'This handle is reserved and cannot be used.',
  })

export interface SetHandleFormState {
  message: string
  success: boolean
  fieldErrors?: {
    handle?: string[]
  }
}

export async function setAffiliateHandleAction(
  prevState: SetHandleFormState,
  formData: FormData
): Promise<SetHandleFormState> {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return { success: false, message: 'Authentication required.' }
  }

  const userId = session.user.id
  const handleResult = HandleSchema.safeParse(formData.get('handle'))

  if (!handleResult.success) {
    const formErrors = handleResult.error.flatten().formErrors
    const message =
      formErrors.find((err) => err.includes('reserved')) ||
      formErrors[0] ||
      'Invalid handle format.'
    return {
      success: false,
      message: message,
      fieldErrors: { handle: formErrors },
    }
  }

  const desiredHandle = handleResult.data

  try {
    const currentUser = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: { handle: true },
    })

    if (currentUser?.handle) {
      return { success: false, message: 'You already have a handle set.' }
    }

    const existingUser = await db.query.user.findFirst({
      where: and(
        eq(schema.user.handle, desiredHandle),
        ne(schema.user.id, userId)
      ),
      columns: { id: true },
    })

    if (existingUser) {
      return {
        success: false,
        message: `Handle "${desiredHandle}" is already taken. Please choose another.`,
        fieldErrors: { handle: ['This handle is already taken.'] },
      }
    }

    await db
      .update(schema.user)
      .set({
        handle: desiredHandle,
        referral_limit: AFFILIATE_USER_REFFERAL_LIMIT,
      })
      .where(eq(schema.user.id, userId))

    revalidatePath('/affiliates')

    return { success: true, message: 'Handle set successfully!' }
  } catch (error) {
    console.error('Error setting affiliate handle:', error)
    return { success: false, message: 'An unexpected error occurred.' }
  }
}
