'use server'

import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

// Define validation schema for the handle
// Allows alphanumeric characters and underscores, 3-20 characters long.
const HandleSchema = z
  .string()
  .min(3, 'Handle must be at least 3 characters long.')
  .max(20, 'Handle cannot be longer than 20 characters.')
  .regex(
    /^[a-zA-Z0-9_]+$/,
    'Handle can only contain letters, numbers, and underscores.'
  )
  .transform((str) => str.toLowerCase()) // Store handles in lowercase

const AFFILIATE_REFERRAL_LIMIT = 5000

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
    // For a simple schema like z.string(), errors are usually in formErrors.
    // We'll map the formErrors to the 'handle' field in our state.
    const formErrors = handleResult.error.flatten().formErrors;
    return {
      success: false,
      // Use the first form error as the main message, or a default.
      message: formErrors[0] || 'Invalid handle format.',
      // Assign the form errors array to the 'handle' field.
      fieldErrors: { handle: formErrors },
    }
  }

  const desiredHandle = handleResult.data

  try {
    // Check if the user already has a handle set
    const currentUser = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: { handle: true },
    })

    if (currentUser?.handle) {
      return { success: false, message: 'You already have a handle set.' }
    }

    // Check if the desired handle is already taken by another user
    const existingUser = await db.query.user.findFirst({
      where: and(
        eq(schema.user.handle, desiredHandle),
        ne(schema.user.id, userId) // Ensure it's not the current user's existing handle (though checked above)
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

    // Update the user's handle and referral limit
    await db
      .update(schema.user)
      .set({
        handle: desiredHandle,
        referral_limit: AFFILIATE_REFERRAL_LIMIT,
      })
      .where(eq(schema.user.id, userId))

    // Revalidate the path if needed, e.g., if the affiliates page displays the handle
    revalidatePath('/affiliates') // Or potentially a profile/settings page path

    return { success: true, message: 'Handle set successfully!' }
  } catch (error) {
    console.error('Error setting affiliate handle:', error)
    return { success: false, message: 'An unexpected error occurred.' }
  }
}