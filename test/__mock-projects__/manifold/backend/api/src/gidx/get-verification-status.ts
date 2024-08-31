import { APIError, APIHandler } from 'api/helpers/endpoint'
import {
  getGIDXCustomerProfile,
  getUserRegistrationRequirements,
} from 'shared/gidx/helpers'
import { GIDXCustomerProfile } from 'common/gidx/gidx'
import { verifyReasonCodes } from 'api/gidx/register'
import { getIdentityVerificationDocuments } from 'api/gidx/get-verification-documents'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { getUser } from 'shared/utils'
import { TWOMBA_ENABLED } from 'common/envs/constants'

export const getVerificationStatus: APIHandler<
  'get-verification-status-gidx'
> = async (_, auth) => {
  if (!TWOMBA_ENABLED) throw new APIError(400, 'GIDX registration is disabled')
  const customerProfile = await getGIDXCustomerProfile(auth.uid)
  return await getVerificationStatusInternal(auth.uid, customerProfile)
}

export const getVerificationStatusInternal = async (
  userId: string,
  customerProfile: GIDXCustomerProfile
) => {
  await getUserRegistrationRequirements(userId)
  const {
    ReasonCodes,
    ResponseMessage,
    ResponseCode,
    FraudConfidenceScore,
    IdentityConfidenceScore,
  } = customerProfile
  const pg = createSupabaseDirectClient()
  const user = await getUser(userId, pg)
  if (!user) {
    return {
      status: 'error',
      message: 'User not found',
    }
  }
  if (ResponseCode === 501 && ResponseMessage.includes('not found')) {
    // TODO: broadcast this user update when we have that functionality
    await pg.none(`update users set data = data - 'kycStatus' where id = $1`, [
      userId,
    ])
    return {
      status: 'error',
      message: 'User not found in GIDX',
    }
  }
  const { status, message } = await verifyReasonCodes(
    userId,
    ReasonCodes,
    FraudConfidenceScore,
    IdentityConfidenceScore
  )
  if (status === 'error') {
    return {
      status: 'error',
      message,
    }
  }
  const { isPending, isVerified, isRejected, documents } =
    await getIdentityVerificationDocuments(userId)

  if (isVerified && user.kycStatus !== 'verified') {
    // They passed the reason codes and have the required documents
    await updateUser(pg, userId, {
      kycStatus: 'verified',
    })
  } else if (isPending && user.kycStatus !== 'pending') {
    await updateUser(pg, userId, {
      kycStatus: 'pending',
    })
  } else if (isRejected && user.kycStatus !== 'await-documents') {
    await updateUser(pg, userId, {
      kycStatus: 'await-documents',
    })
  }

  return {
    status: 'success',
    documents,
  }
}
