import { APIError, APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getPrivateUser, getUser, log } from 'shared/utils'
import { PHONE_VERIFICATION_BONUS, SUS_STARTING_BALANCE } from 'common/economy'
import { SignupBonusTxn } from 'common/txn'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { rateLimitByUser } from './helpers/rate-limit'
import { updateUser } from 'shared/supabase/users'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const twilio = require('twilio')

export const verifyPhoneNumber: APIHandler<'verify-phone-number'> =
  rateLimitByUser(async (props, auth) => {
    const pg = createSupabaseDirectClient()

    // TODO: transaction over this sql query rather than over user properties
    const { phoneNumber, code: otpCode } = props

    await pg.tx(async (tx) => {
      const userHasPhoneNumber = await tx.oneOrNone(
        `select phone_number from private_user_phone_numbers where user_id = $1
            or phone_number = $2
            limit 1
            `,
        [auth.uid, phoneNumber]
      )
      if (userHasPhoneNumber) {
        throw new APIError(400, 'User verified phone number already.')
      }
      const authToken = process.env.TWILIO_AUTH_TOKEN
      const client = new twilio(process.env.TWILIO_SID, authToken)
      const lookup = await client.lookups.v2
        .phoneNumbers(phoneNumber)
        .fetch({ fields: 'line_type_intelligence' })
      if (
        lookup.lineTypeIntelligence.type !== 'mobile' &&
        lookup.lineTypeIntelligence.type !== null &&
        lookup.countryCode !== 'CA'
      ) {
        throw new APIError(400, 'Only mobile carriers allowed')
      }
      const verification = await client.verify.v2
        .services(process.env.TWILIO_VERIFY_SID)
        .verificationChecks.create({ to: phoneNumber, code: otpCode })
      if (verification.status !== 'approved') {
        throw new APIError(400, 'Invalid code. Please try again.')
      }

      await tx
        .none(
          `insert into private_user_phone_numbers (user_id, phone_number) values ($1, $2)
            on conflict (user_id) do nothing `,
          [auth.uid, phoneNumber]
        )
        .catch((e) => {
          log(e)
          throw new APIError(400, 'Phone number already exists')
        })
        .then(() => {
          log(verification.status, { phoneNumber, otpCode })
        })

      const privateUser = await getPrivateUser(auth.uid, tx)
      if (!privateUser)
        throw new APIError(401, `Private user ${auth.uid} not found`)
      const isPrivateUserWithMatchingDeviceToken = async (
        deviceToken: string
      ) => {
        const data = await tx.oneOrNone<1>(
          `select 1 from private_users where (data->'initialDeviceToken')::text = $1 and id != $2`,
          [deviceToken, auth.uid]
        )

        return !!data
      }
      const { initialDeviceToken: deviceToken } = privateUser

      const deviceUsedBefore =
        !deviceToken ||
        (await isPrivateUserWithMatchingDeviceToken(deviceToken))

      const amount = deviceUsedBefore
        ? SUS_STARTING_BALANCE
        : PHONE_VERIFICATION_BONUS

      const user = await getUser(auth.uid, tx)
      if (!user) throw new APIError(401, `User ${auth.uid} not found`)

      const { verifiedPhone } = user
      if (!verifiedPhone) {
        await updateUser(tx, auth.uid, {
          verifiedPhone: true,
        })

        const signupBonusTxn: Omit<
          SignupBonusTxn,
          'fromId' | 'id' | 'createdTime'
        > = {
          fromType: 'BANK',
          amount: amount,
          category: 'SIGNUP_BONUS',
          toId: auth.uid,
          token: 'M$',
          toType: 'USER',
          description: 'Phone number verification bonus',
        }
        await runTxnFromBank(tx, signupBonusTxn)
        log(`Sent phone verification bonus to user ${auth.uid}`)
      }
    })

    return { status: 'success' }
  })
