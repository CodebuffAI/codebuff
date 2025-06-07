import { logger } from 'common/src/util/logger'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'

import type { LoopsEmailData, SendEmailResult } from './types'

const ORGANIZATION_INVITATION_TRANSACTIONAL_ID = 'cmbikixxm15xo4a0iiemzkzw1'
const BASIC_TRANSACTIONAL_ID = 'cmb8pafk92r820w0i7lkplkt2'

// Lazy initialization of Loops client
let loopsClient: any | null = null
let LoopsClient: any = null
let APIError: any = null

function initializeLoopsClient() {
  if (loopsClient !== null) return loopsClient

  try {
    const loops = require('loops')
    LoopsClient = loops.LoopsClient
    APIError = loops.APIError
    
    if (process.env.LOOPS_API_KEY && LoopsClient) {
      loopsClient = new LoopsClient(process.env.LOOPS_API_KEY)
    } else {
      loopsClient = false // Mark as attempted but failed
    }
  } catch (error) {
    // Silently fail in test environments or when loops package is not available
    loopsClient = false
  }
  
  return loopsClient
}

async function sendTransactionalEmail(
  transactionalId: string,
  email: string,
  dataVariables: Record<string, any> = {}
): Promise<SendEmailResult> {
  const client = initializeLoopsClient()
  if (!client) {
    return {
      success: false,
      error:
        'Loops SDK not initialized (LOOPS_API_KEY missing or SDK init failed).',
    }
  }

  try {
    const response = await client.sendTransactionalEmail({
      transactionalId,
      email,
      dataVariables,
    })

    logger.info(
      { email, transactionalId, loopsId: (response as any)?.id },
      'Loops transactional email sent successfully via SDK'
    )
    return { success: true, loopsId: (response as any)?.id }
  } catch (error: any) {
    let errorMessage = 'Unknown SDK error during transactional email'
    if (error instanceof APIError) {
      logger.error(
        {
          message: error.message,
          statusCode: error.statusCode,
          email,
          transactionalId,
          errorType: 'APIError',
        },
        `Loops APIError sending transactional email: ${error.message}`
      )
      errorMessage = `Loops APIError: ${error.message} (Status: ${error.statusCode})`
    } else {
      logger.error(
        { email, transactionalId, error },
        'An unexpected error occurred sending transactional email via Loops SDK'
      )
    }
    return { success: false, error: errorMessage }
  }
}

export async function sendSignupEventToLoops(
  userId: string,
  email: string | null,
  name: string | null
): Promise<void> {
  const client = initializeLoopsClient()
  if (!client) {
    logger.warn({ userId }, 'Loops SDK not initialized. Skipping signup event.')
    return
  }
  if (!email) {
    logger.warn(
      { userId },
      'User email missing, cannot send Loops signup event.'
    )
    return
  }

  try {
    const response = await client.sendEvent({
      eventName: 'signup',
      email,
      userId,
      contactProperties: {
        firstName: name?.split(' ')[0] ?? '',
      },
    })

    logger.info(
      { email, userId, eventName: 'signup', loopsId: (response as any)?.id },
      'Sent signup event to Loops via SDK'
    )
  } catch (error: any) {
    if (error instanceof APIError) {
      logger.error(
        {
          message: error.message,
          statusCode: error.statusCode,
          email,
          userId,
          eventName: 'signup',
          errorType: 'APIError',
        },
        `Loops APIError sending event: ${error.message}`
      )
    } else {
      logger.error(
        { error, email, userId, eventName: 'signup' },
        'An unexpected error occurred sending signup event via Loops SDK'
      )
    }
    // Original function did not return error status, just logged.
  }
}

export async function sendOrganizationInvitationEmail(
  data: LoopsEmailData // data no longer contains firstName
): Promise<SendEmailResult> {
  let lookedUpFirstName: string = 'there' // Default to 'there'
  try {
    const inviteeUserRecord = await db
      .select({ name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.email, data.email.toLowerCase())) // Compare email case-insensitively
      .limit(1)

    if (inviteeUserRecord.length > 0 && inviteeUserRecord[0].name) {
      lookedUpFirstName = inviteeUserRecord[0].name.split(' ')[0] || 'there'
    }
  } catch (error) {
    logger.error(
      {
        email: data.email,
        error,
        source: 'sendOrganizationInvitationEmail-lookup',
      },
      'Error fetching user by email for invitation, using default name.'
    )
    // Continue with default name 'there'
  }

  return sendTransactionalEmail(
    ORGANIZATION_INVITATION_TRANSACTIONAL_ID,
    data.email,
    {
      firstName: lookedUpFirstName, // Use the looked-up or default name
      organizationName: data.organizationName || '', // data.organizationName is still expected
      inviterName: data.inviterName || '', // data.inviterName is still expected
      invitationUrl: data.invitationUrl || '', // data.invitationUrl is still expected
      role: data.role || 'member', // data.role is still expected
    }
  )
}

export async function sendBasicEmail(
  email: string,
  data: { subject: string; message: string }
): Promise<SendEmailResult> {
  return sendTransactionalEmail(BASIC_TRANSACTIONAL_ID, email, {
    subject: data.subject,
    message: data.message,
  })
}
