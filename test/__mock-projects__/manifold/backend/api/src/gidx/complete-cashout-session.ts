import { APIError, APIHandler } from 'api/helpers/endpoint'
import { CompleteSessionDirectCashierResponse } from 'common/gidx/gidx'
import {
  getGIDXStandardParams,
  getUserRegistrationRequirements,
} from 'shared/gidx/helpers'
import { log } from 'shared/monitoring/log'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxn } from 'shared/txn/run-txn'
import { MANA_CASH_TO_DOLLARS_OUT_GIDX, CashAmountGIDX } from 'common/economy'
import { getIp } from 'shared/analytics'
import { TWOMBA_ENABLED } from 'common/envs/constants'

const ENDPOINT =
  'https://api.gidx-service.in/v3.0/api/DirectCashier/CompleteSession'

const getManaCashAmountForDollars = (dollars: number) => {
  const manaCash = Object.entries(MANA_CASH_TO_DOLLARS_OUT_GIDX).find(
    ([, p]) => p === dollars
  )
  if (!manaCash) {
    throw new APIError(400, 'Invalid cashout amount')
  }
  return parseInt(manaCash[0]) as CashAmountGIDX
}

// TODO: This is a WIP, not nearly done yet
export const completeCashoutSession: APIHandler<
  'complete-cashout-session-gidx'
> = async (props, auth, req) => {
  if (!TWOMBA_ENABLED) throw new APIError(400, 'GIDX registration is disabled')
  const userId = auth.uid
  const { phoneNumberWithCode } = await getUserRegistrationRequirements(userId)
  const {
    PaymentMethod,
    MerchantSessionID,
    PaymentAmount,
    MerchantTransactionID,
    SavePaymentMethod,
  } = props
  const manaCashAmount = getManaCashAmountForDollars(PaymentAmount.dollars)

  const body = {
    PaymentAmount,
    SavePaymentMethod,
    DeviceIpAddress: getIp(req),
    MerchantTransactionID,
    PaymentMethod: {
      ...PaymentMethod,
      PhoneNumber: phoneNumberWithCode,
    },
    ...getGIDXStandardParams(MerchantSessionID),
  }
  log('complete cashout session body:', body)
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
  if (CompletedPaymentAmount !== PaymentAmount.dollars) {
    log.error('Payment amount mismatch', {
      CompletedPaymentAmount,
      PaymentAmount,
    })
  }
  if (PaymentStatusCode === '1') {
    await debitCoins(
      userId,
      manaCashAmount,
      PaymentAmount.dollars,
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

const debitCoins = async (
  userId: string,
  manaCashAmount: CashAmountGIDX,
  payoutInDollars: number,
  transactionId: string
) => {
  const data = { transactionId, type: 'gidx', payoutInDollars }
  const pg = createSupabaseDirectClient()
  const manaCashoutTxn = {
    fromId: userId,
    fromType: 'USER',
    toId: 'EXTERNAL',
    toType: 'BANK',
    data,
    amount: manaCashAmount,
    token: 'CASH',
    category: 'CASH_OUT_PENDING',
    description: `Pending cash out debit`,
  } as const

  await pg.tx(async (tx) => {
    await runTxn(tx, manaCashoutTxn)
  })
}
