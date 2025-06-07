import db from '../db'
import * as schema from '../db/schema'
import { eq } from 'drizzle-orm'
import { logger } from '@codebuff/common/util/logger'
import { env } from '@codebuff/common/env.mjs'

export interface LoopsEmailData {
  email: string
  firstName?: string
  lastName?: string
  userId?: string
  organizationName?: string
  inviterName?: string
  invitationUrl?: string
  role?: string
}

export interface LoopsResponse {
  success: boolean
  id?: string
  message?: string
}

export interface SendEmailResult {
  success: boolean
  error?: string
}

let loopsClient: any = null

export function initializeLoopsClient() {
  if (!env.LOOPS_API_KEY) {
    logger.warn('LOOPS_API_KEY not configured, email sending will be disabled')
    return null
  }

  // Initialize Loops client here
  return null
}

export async function sendTransactionalEmail(
  templateId: string,
  data: LoopsEmailData
): Promise<SendEmailResult> {
  try {
    if (!env.LOOPS_API_KEY) {
      logger.warn('LOOPS_API_KEY not configured, skipping email send')
      return { success: false, error: 'Email service not configured' }
    }

    // Send email via Loops API
    logger.info(
      { templateId, email: data.email },
      'Sending transactional email'
    )

    return { success: true }
  } catch (error) {
    logger.error(
      { error, templateId, email: data.email },
      'Failed to send email'
    )
    return { success: false, error: 'Failed to send email' }
  }
}

export async function sendSignupEventToLoops(
  userId: string,
  email: string | null,
  name: string | null
): Promise<void> {
  try {
    if (!email) {
      logger.warn({ userId }, 'No email provided for signup event')
      return
    }

    logger.info({ userId, email }, 'Sending signup event to Loops')

    // Send signup event to Loops
  } catch (error) {
    logger.error(
      { userId, email, error },
      'Failed to send signup event to Loops'
    )
  }
}

export async function sendOrganizationInvitationEmail(data: {
  email: string
  organizationName: string
  inviterName: string
  invitationUrl: string
  role: string
}): Promise<SendEmailResult> {
  return sendTransactionalEmail('org-invitation', data)
}

export async function sendBasicEmail(
  to: string,
  subject: string,
  content: string
): Promise<SendEmailResult> {
  return sendTransactionalEmail('basic', {
    email: to,
    // Add other fields as needed
  })
}
