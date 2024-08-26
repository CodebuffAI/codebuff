import { APIError, APIHandler } from 'api/helpers/endpoint'
import { CompleteSessionDirectCashierResponse } from 'common/gidx/gidx'
import {
  getGIDXStandardParams,
  getUserRegistrationRequirements,
} from 'shared/gidx/helpers'
import { log } from 'shared/monitoring/log'
import { updateUser } from 'shared/supabase/users'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxn } from 'shared/txn/run-txn'
import { PaymentAmountsGIDX, PaymentAmount } from 'common/economy'
import { getIp } from 'shared/analytics'
import { TWOMBA_ENABLED } from 'common/envs/constants'

const ENDPOINT =
  'https://api.gidx-service.in/v3.0/api/DirectCashier/CompleteSession'

const getPaymentAmountForWebPrice = (price: number) => {
  const amount = PaymentAmountsGIDX.find((p) => p.price === price)
  if (!amount) {
    throw new APIError(400, 'Invalid price')
  }
  return amount
}

export const completeCheckoutSession: APIHandler<
  'complete-checkout-session-gidx'
> = async (props, auth, req) => {
  if (!TWOMBA_ENABLED) throw new APIError(400, 'GIDX registration is disabled')
  const userId = auth.uid
  const { phoneNumberWithCode } = await getUserRegistrationRequirements(userId)
  const {
    PaymentMethod,
    MerchantSessionID,
    PaymentAmount,
    MerchantTransactionID,
  } = props
  const paymentAmount = getPaymentAmountForWebPrice(PaymentAmount.price)

  const { creditCard, Type, BillingAddress, NameOnAccount, SavePaymentMethod } =
    PaymentMethod
  if (Type === 'CC' && !creditCard) {
    throw new APIError(400, 'Must include credit card information')
  }
  const body = {
    PaymentAmount: {
      PaymentAmount: PaymentAmount.price / 100,
      BonusAmount: 0,
    },
    DeviceIpAddress: getIp(req),
    MerchantTransactionID,
    SavePaymentMethod,
    PaymentMethod: {
      Type,
      NameOnAccount,
      ...creditCard,
      PhoneNumber: phoneNumberWithCode,
      BillingAddress,
    },
    ...getGIDXStandardParams(MerchantSessionID),
  }
  log('complete checkout session body:', body)

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new APIError(400, 'GIDX complete checkout session failed')
  }
  const data = (await res.json()) as CompleteSessionDirectCashierResponse
  log('Complete checkout session response:', data)
  const {
    SessionStatusCode,
    AllowRetry,
    PaymentDetails,
    SessionStatusMessage,
  } = data
  if (SessionStatusCode === 1) {
    return {
      status: 'error',
      message: 'Your information could not be succesfully validated',
      gidxMessage: SessionStatusMessage,
    }
  } else if (SessionStatusCode === 2) {
    return {
      status: 'error',
      message: 'Your information is incomplete',
      gidxMessage: SessionStatusMessage,
    }
  } else if (SessionStatusCode === 3 && AllowRetry) {
    return {
      status: 'error',
      message: 'Payment timeout, please try again',
      gidxMessage: SessionStatusMessage,
    }
  } else if (SessionStatusCode === 3 && !AllowRetry) {
    return {
      status: 'error',
      message: 'Payment timeout',
      gidxMessage: SessionStatusMessage,
    }
  } else if (SessionStatusCode >= 4) {
    return {
      status: 'pending',
      message: 'Please complete next step',
      gidxMessage: SessionStatusMessage,
    }
  }

  const {
    PaymentStatusCode,
    PaymentStatusMessage,
    PaymentAmount: CompletedPaymentAmount,
  } = PaymentDetails[0]
  if (CompletedPaymentAmount !== PaymentAmount.price / 100) {
    log.error('Payment amount mismatch', {
      CompletedPaymentAmount,
      PaymentAmount,
    })
  }
  if (PaymentStatusCode === '1') {
    await sendCoins(
      userId,
      paymentAmount,
      CompletedPaymentAmount,
      MerchantTransactionID
    )
    return {
      status: 'success',
      message: 'Payment successful',
      gidxMessage: PaymentStatusMessage,
    }
  } else if (PaymentStatusCode === '2') {
    return {
      status: 'error',
      message: 'Payment ineligible',
      gidxMessage: PaymentStatusMessage,
    }
  } else if (PaymentStatusCode === '3') {
    return {
      status: 'error',
      message: 'Payment failed',
      gidxMessage: PaymentStatusMessage,
    }
  } else if (PaymentStatusCode === '4') {
    return {
      status: 'pending',
      message: 'Payment processing',
      gidxMessage: PaymentStatusMessage,
    }
  } else if (PaymentStatusCode === '5') {
    return {
      status: 'error',
      message: 'Payment reversed',
      gidxMessage: PaymentStatusMessage,
    }
  } else if (PaymentStatusCode === '6') {
    return {
      status: 'error',
      message: 'Payment canceled',
      gidxMessage: PaymentStatusMessage,
    }
  } else if (PaymentStatusCode === '0') {
    return {
      status: 'pending',
      message: 'Payment pending',
      gidxMessage: PaymentStatusMessage,
    }
  }

  return {
    status: 'error',
    message: 'Unknown payment status',
  }
}

const sendCoins = async (
  userId: string,
  amount: PaymentAmount,
  paidInCents: number,
  transactionId: string
) => {
  const data = { transactionId, type: 'gidx', paidInCents }
  const pg = createSupabaseDirectClient()
  const manaPurchaseTxn = {
    fromId: 'EXTERNAL',
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    data,
    amount: amount.mana,
    token: 'M$',
    category: 'MANA_PURCHASE',
    description: `Deposit for mana purchase`,
  } as const

  const cashBonusTxn = {
    fromId: 'EXTERNAL',
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    data,
    amount: amount.bonus,
    token: 'CASH',
    category: 'CASH_BONUS',
    description: `Bonus for mana purchase`,
  } as const

  await pg.tx(async (tx) => {
    await runTxn(tx, manaPurchaseTxn)
    await runTxn(tx, cashBonusTxn)
    await updateUser(tx, userId, {
      purchasedMana: true,
    })
  })
}
