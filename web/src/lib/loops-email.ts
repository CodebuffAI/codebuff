import { logger } from '@/util/logger'

interface LoopsEmailData {
  email: string
  firstName?: string
  lastName?: string
  organizationName?: string
  inviterName?: string
  invitationUrl?: string
  role?: string
}

interface LoopsResponse {
  success: boolean
  id?: string
  message?: string
}

/**
 * Send an organization invitation email using Loops.so
 */
export async function sendOrganizationInvitationEmail(
  data: LoopsEmailData
): Promise<{ success: boolean; error?: string }> {
  try {
    const loopsApiKey = process.env.LOOPS_API_KEY
    if (!loopsApiKey) {
      throw new Error('LOOPS_API_KEY environment variable is not set')
    }

    const response = await fetch('https://app.loops.so/api/v1/transactional', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${loopsApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transactionalId: 'organization-invitation', // You'll need to create this template in Loops
        email: data.email,
        dataVariables: {
          firstName: data.firstName || '',
          organizationName: data.organizationName || '',
          inviterName: data.inviterName || '',
          invitationUrl: data.invitationUrl || '',
          role: data.role || 'member',
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Loops API error: ${response.status} - ${errorText}`)
    }

    const result: LoopsResponse = await response.json()
    
    if (!result.success) {
      throw new Error(`Loops email failed: ${result.message}`)
    }

    logger.info(
      { 
        email: data.email, 
        organizationName: data.organizationName,
        loopsId: result.id 
      },
      'Organization invitation email sent successfully'
    )

    return { success: true }
  } catch (error) {
    logger.error(
      { 
        email: data.email, 
        organizationName: data.organizationName,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      'Failed to send organization invitation email'
    )
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

/**
 * Send a welcome email when someone joins an organization
 */
export async function sendOrganizationWelcomeEmail(
  data: LoopsEmailData
): Promise<{ success: boolean; error?: string }> {
  try {
    const loopsApiKey = process.env.LOOPS_API_KEY
    if (!loopsApiKey) {
      throw new Error('LOOPS_API_KEY environment variable is not set')
    }

    const response = await fetch('https://app.loops.so/api/v1/transactional', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${loopsApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transactionalId: 'organization-welcome', // You'll need to create this template in Loops
        email: data.email,
        dataVariables: {
          firstName: data.firstName || '',
          organizationName: data.organizationName || '',
          role: data.role || 'member',
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Loops API error: ${response.status} - ${errorText}`)
    }

    const result: LoopsResponse = await response.json()
    
    if (!result.success) {
      throw new Error(`Loops email failed: ${result.message}`)
    }

    logger.info(
      { 
        email: data.email, 
        organizationName: data.organizationName,
        loopsId: result.id 
      },
      'Organization welcome email sent successfully'
    )

    return { success: true }
  } catch (error) {
    logger.error(
      { 
        email: data.email, 
        organizationName: data.organizationName,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      'Failed to send organization welcome email'
    )
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}
