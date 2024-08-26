import { APIError, APIHandler } from 'api/helpers/endpoint'
import { log } from 'shared/utils'
import { updateUser } from 'shared/supabase/users'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  allowedFlaggedCodes,
  blockedCodes,
  hasIdentityError,
  locationBlockedCodes,
  locationTemporarilyBlockedCodes,
  otherErrorCodes,
  RegistrationReturnType,
  timeoutCodes,
  underageErrorCodes,
} from 'common/reason-codes'
import { intersection } from 'lodash'
import {
  getGIDXStandardParams,
  getUserRegistrationRequirements,
} from 'shared/gidx/helpers'
import { GIDXRegistrationResponse, ID_ERROR_MSG } from 'common/gidx/gidx'
import { getIdentityVerificationDocuments } from 'api/gidx/get-verification-documents'
import { TWOMBA_ENABLED } from 'common/envs/constants'

const ENDPOINT =
  'https://api.gidx-service.in/v3.0/api/CustomerIdentity/CustomerRegistration'

export const register: APIHandler<'register-gidx'> = async (props, auth) => {
  if (!TWOMBA_ENABLED) throw new APIError(400, 'GIDX registration is disabled')
  await getUserRegistrationRequirements(auth.uid)
  const body = {
    // TODO: add back in prod
    // MerchantCustomerID: auth.uid,
    // EmailAddress: user.email,
    // MobilePhoneNumber: parsePhoneNumber(phoneNumberWithCode)?.nationalNumber ?? phoneNumberWithCode,
    // DeviceIpAddress: getIp(req),
    ...getGIDXStandardParams(),
    ...props,
  }
  log('Registration request:', body)
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new APIError(400, 'GIDX registration failed')
  }

  const data = (await res.json()) as GIDXRegistrationResponse
  log('Registration response:', data)
  const { ReasonCodes, FraudConfidenceScore, IdentityConfidenceScore } = data
  const { status, message } = await verifyReasonCodes(
    auth.uid,
    ReasonCodes,
    FraudConfidenceScore,
    IdentityConfidenceScore
  )
  if (status === 'success') {
    // TODO: we may not want to await documents for every user, and instead just verify them
    const pg = createSupabaseDirectClient()
    await updateUser(pg, auth.uid, {
      kycStatus: 'await-documents',
    })
  }
  return {
    status,
    message,
  }
}

export const verifyReasonCodes = async (
  userId: string,
  ReasonCodes: string[],
  FraudConfidenceScore: number | undefined,
  IdentityConfidenceScore: number | undefined
): Promise<RegistrationReturnType> => {
  const pg = createSupabaseDirectClient()

  const hasAny = (codes: string[]) =>
    intersection(codes, ReasonCodes).length > 0

  // Timeouts or input errors
  if (hasAny(otherErrorCodes)) {
    log('Registration failed, resulted in error codes:', ReasonCodes)
    await updateUser(pg, userId, { kycStatus: 'fail' })
    if (hasAny(timeoutCodes)) {
      return {
        status: 'error',
        message: 'Registration timed out, please try again.',
      }
    }
    if (ReasonCodes.includes('LL-FAIL')) {
      return {
        status: 'error',
        message:
          'Registration failed, location error. Check your location information.',
      }
    }
  }

  if (hasAny(['PAY-HVEL-CL', 'PAY-HVEL-CKI'])) {
    const userType = ReasonCodes.includes('PAY-HVEL-CKI')
      ? 'Fully KYC (Internally) Customer'
      : 'user'
    return {
      status: 'warning',
      message: `High velocity of payments detected for ${userType}.`,
    }
  }

  // User identity not found/verified
  if (hasIdentityError(ReasonCodes)) {
    log('Registration failed, resulted in identity errors:', ReasonCodes)
    const { isPending } = await getIdentityVerificationDocuments(userId)
    if (isPending) {
      await updateUser(pg, userId, { kycStatus: 'pending' })
      return { status: 'success' }
    }

    await updateUser(pg, userId, { kycStatus: 'fail' })
    return {
      status: 'error',
      message: ID_ERROR_MSG,
    }
  }

  // User is flagged for unknown address, vpn, unclear DOB, distance between attempts
  const allowedFlags = intersection(allowedFlaggedCodes, ReasonCodes)
  if (allowedFlags.length > 0) {
    await updateUser(pg, userId, { kycFlags: allowedFlags })
  }

  // User is in disallowed location, but they may move
  if (hasAny(locationTemporarilyBlockedCodes)) {
    log(
      'Registration failed, resulted in temporary blocked location codes:',
      ReasonCodes
    )
    await updateUser(pg, userId, {
      kycStatus: 'temporary-block',
      kycLastAttempt: Date.now(),
    })
    return {
      status: 'error',
      message:
        'Registration failed, location blocked. Try again in 3 hours in an allowed location.',
    }
  }

  // User is blocked for any number of reasons
  const blockedReasonCodes = intersection(blockedCodes, ReasonCodes)
  if (blockedReasonCodes.length > 0) {
    log('Registration failed, resulted in blocked codes:', blockedReasonCodes)
    await updateUser(pg, userId, { kycStatus: 'block' })
    if (hasAny(locationBlockedCodes)) {
      return {
        status: 'error',
        message: 'Registration failed, location blocked or high risk.',
      }
    }
    if (hasAny(underageErrorCodes)) {
      return {
        status: 'error',
        message: 'Registration failed, you must be 18+, (19+ in some states).',
      }
    }
    if (ReasonCodes.includes('ID-EX')) {
      return {
        status: 'error',
        message: 'Registration failed, ID exists already. Contact admins.',
      }
    }
    return { status: 'error', message: 'Registration failed, blocked.' }
  }

  // User identity match is low confidence or attempt may be fraud
  if (
    FraudConfidenceScore !== undefined &&
    IdentityConfidenceScore !== undefined &&
    (FraudConfidenceScore < 80 || IdentityConfidenceScore < 80)
  ) {
    log(
      'Registration failed, resulted in low confidence scores:',
      FraudConfidenceScore,
      IdentityConfidenceScore
    )
    await updateUser(pg, userId, { kycStatus: 'fail' })
    return {
      status: 'error',
      message:
        'Confidence in identity or fraud too low. Double check your information.',
    }
  }

  // User is not blocked and ID is verified
  if (ReasonCodes.includes('ID-VERIFIED')) {
    log('Registration passed with allowed codes:', ReasonCodes)
    return { status: 'success' }
  }

  log.error(
    `Registration failed with unknown reason codes: ${ReasonCodes.join(', ')}`
  )
  return {
    status: 'error',
    message:
      'Registration failed, ask admin about codes: ' + ReasonCodes.join(', '),
  }
}
