import type { Logger } from '@codebuff/common/types/contracts/logger'

export interface LoginUrlResponse {
  loginUrl: string
  fingerprintHash: string
  expiresAt: string
}

export interface GenerateLoginUrlDeps {
  fetch: typeof fetch
  logger: Logger
}

export interface GenerateLoginUrlOptions {
  baseUrl: string
  fingerprintId: string
}

export async function generateLoginUrl(
  deps: GenerateLoginUrlDeps,
  options: GenerateLoginUrlOptions,
): Promise<LoginUrlResponse> {
  const { fetch, logger } = deps
  const { baseUrl, fingerprintId } = options

  logger.info(
    { fingerprintId, baseUrl },
    '🌐 Generating login URL via CLI auth endpoint',
  )

  const url = `${baseUrl}/api/auth/cli/code`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fingerprintId }),
  })

  logger.info(
    {
      status: response.status,
      statusText: response.statusText,
    },
    '📥 Received response from login URL endpoint',
  )

  if (!response.ok) {
    logger.error(
      {
        status: response.status,
        statusText: response.statusText,
      },
      '❌ Failed to request login URL',
    )
    throw new Error('Failed to get login URL')
  }

  const data = (await response.json()) as LoginUrlResponse

  logger.info(
    {
      hasLoginUrl: !!data.loginUrl,
      hasFingerprintHash: !!data.fingerprintHash,
      expiresAt: data.expiresAt,
    },
    '✅ Login URL generated successfully',
  )

  return data
}

interface PollLoginStatusDeps {
  fetch: typeof fetch
  sleep: (ms: number) => Promise<void>
  logger: Logger
  now?: () => number
}

interface PollLoginStatusOptions {
  baseUrl: string
  fingerprintId: string
  fingerprintHash: string
  expiresAt: string
  intervalMs?: number
  timeoutMs?: number
  shouldContinue?: () => boolean
}

export type PollLoginStatusResult =
  | { status: 'success'; user: Record<string, unknown>; attempts: number }
  | { status: 'timeout' }
  | { status: 'aborted' }

export async function pollLoginStatus(
  deps: PollLoginStatusDeps,
  options: PollLoginStatusOptions,
): Promise<PollLoginStatusResult> {
  const { fetch, sleep, logger } = deps
  const {
    baseUrl,
    fingerprintId,
    fingerprintHash,
    expiresAt,
    intervalMs = 5000,
    timeoutMs = 5 * 60 * 1000,
    shouldContinue,
  } = options

  const now = deps.now ?? Date.now
  const startTime = now()
  let attempts = 0

  logger.info(
    {
      baseUrl,
      fingerprintId,
      fingerprintHash,
      expiresAt,
      intervalMs,
      timeoutMs,
    },
    '🚀 Starting login polling session',
  )

  while (true) {
    if (shouldContinue && !shouldContinue()) {
      logger.warn('🛑 Polling aborted by caller')
      return { status: 'aborted' }
    }

    if (now() - startTime >= timeoutMs) {
      logger.warn('⌛️ Login polling timed out')
      return { status: 'timeout' }
    }

    attempts += 1

    const url = new URL('/api/auth/cli/status', baseUrl)
    url.searchParams.set('fingerprintId', fingerprintId)
    url.searchParams.set('fingerprintHash', fingerprintHash)
    url.searchParams.set('expiresAt', expiresAt)

    logger.info(
      { attempts, url: url.toString() },
      '📡 Polling login status endpoint',
    )

    let response: Response
    try {
      response = await fetch(url.toString())
    } catch (error) {
      logger.error(
        {
          attempts,
          error: error instanceof Error ? error.message : String(error),
        },
        '💥 Network error during login status polling',
      )
      await sleep(intervalMs)
      continue
    }

    logger.info(
      {
        attempts,
        status: response.status,
        ok: response.ok,
      },
      '📥 Received polling response',
    )

    if (!response.ok) {
      if (response.status === 401) {
        logger.debug(
          { attempts },
          '🔒 Poll attempt returned 401 (user not logged in yet)',
        )
      } else {
        logger.warn(
          {
            attempts,
            status: response.status,
            statusText: response.statusText,
          },
          '⚠️ Unexpected status while polling',
        )
      }
      await sleep(intervalMs)
      continue
    }

    let data: unknown
    try {
      data = await response.json()
    } catch (error) {
      logger.error(
        {
          attempts,
          error: error instanceof Error ? error.message : String(error),
        },
        '💥 Failed to parse polling response JSON',
      )
      await sleep(intervalMs)
      continue
    }

    const user = (data as Record<string, unknown> | null)?.user
    if (user && typeof user === 'object') {
      logger.info(
        {
          attempts,
          userPreview: {
            name: (user as { name?: string }).name ?? null,
            email: (user as { email?: string }).email ?? null,
            id: (user as { id?: string }).id ?? null,
          },
        },
        '🎉 Login detected during polling',
      )
      return { status: 'success', user, attempts }
    }

    logger.debug(
      { attempts },
      '⏳ Polling response did not include user yet, continuing',
    )
    await sleep(intervalMs)
  }
}
