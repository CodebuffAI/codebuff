import { APIHandler } from 'api/helpers/endpoint'
import { log } from 'shared/utils'
import { getGIDXCustomerProfile } from 'shared/gidx/helpers'
import { getVerificationStatusInternal } from 'api/gidx/get-verification-status'

export const identityCallbackGIDX: APIHandler<
  'identity-callback-gidx'
> = async (props) => {
  log('identity-callback-gidx', props)

  const { MerchantCustomerID } = props
  const customerProfile = await getGIDXCustomerProfile(MerchantCustomerID)
  log('CustomerProfile', customerProfile)
  return {
    result: { Accepted: true },
    continue: async () => {
      await getVerificationStatusInternal(MerchantCustomerID, customerProfile)
    },
  }
}

export const paymentCallbackGIDX: APIHandler<'payment-callback-gidx'> = async (
  props
) => {
  log('payment-callback-gidx', props)
  // TODO: we could double check here that the txns were sent given succesful payment
  //  and if not, resend them
  // const { MerchantCustomerID } = props
  // const customerProfile = await getGIDXCustomerProfile(MerchantCustomerID)
  // log('CustomerProfile', customerProfile)
  return {
    Accepted: true,
    // result: { Accepted: true },
    // continue: async () => {
    //   await getVerificationStatusInternal(MerchantCustomerID, customerProfile)
    // },
  }
}
