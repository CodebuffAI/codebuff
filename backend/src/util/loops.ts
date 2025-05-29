/**
 * Utility for sending emails via the Loops API
 */

const LOOPS_SUBJECT_MESSAGE_TRANSACTIONAL_ID = 'cmb8pafk92r820w0i7lkplkt2'

/**
 * Sends an email via the Loops API using subject and message fields
 */
export async function sendLoopsEmail(
  email: string,
  emailData: {
    subject: string
    message: string
  }
): Promise<boolean> {
  const loopsApiKey = process.env.LOOPS_API_KEY

  if (!loopsApiKey) {
    console.warn('LOOPS_API_KEY not configured, skipping email send')
    return false
  }

  try {
    const response = await fetch('https://app.loops.so/api/v1/transactional', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${loopsApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        transactionalId: LOOPS_SUBJECT_MESSAGE_TRANSACTIONAL_ID,
        dataVariables: {
          ...emailData,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(
        `Failed to send email via Loops: ${response.status} ${errorText}`
      )
      return false
    }

    const result = await response.json()
    console.log('✅ Email sent successfully via Loops:', result)
    return true
  } catch (error) {
    console.error('Error sending email via Loops:', error)
    return false
  }
}
