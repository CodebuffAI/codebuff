import { createHash } from 'node:crypto'

export async function trackSignupFB(
  accessToken: string,
  userId: string,
  email: string,
  ip: string
) {
  const pixelId = '254770557407697'
  const apiUrl = `https://graph.facebook.com/v11.0/${pixelId}/events`

  const hashedEmail = createHash('sha256').update(email).digest('hex')

  const requestBody = {
    data: [
      {
        event_name: 'CompleteRegistration',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        user_data: {
          em: [hashedEmail],
          client_ip_address: ip,
        },
        custom_data: {
          user_id: userId,
        },
      },
    ],
    access_token: accessToken,
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    throw new Error(`Failed to track signup event: ${response.statusText}`)
  }

  const result = await response.json()
  console.log('fb tracking result:', result)
}
