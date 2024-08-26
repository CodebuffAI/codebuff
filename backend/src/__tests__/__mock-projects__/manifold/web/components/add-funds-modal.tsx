'use client'
import clsx from 'clsx'
import { AD_REDEEM_REWARD } from 'common/boost'
import {
  BETTING_STREAK_BONUS_MAX,
  IOS_PRICES,
  REFERRAL_AMOUNT,
  MANA_WEB_PRICES,
  WebManaAmounts,
  PaymentAmount,
} from 'common/economy'
import { ENV_CONFIG, TWOMBA_ENABLED } from 'common/envs/constants'
import { MesageTypeMap, nativeToWebMessageType } from 'common/native-message'
import { convertTxn } from 'common/supabase/txns'
import { run } from 'common/supabase/utils'
import { Txn } from 'common/txn'
import { DAY_MS } from 'common/util/time'
import { sum } from 'lodash'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Row } from 'web/components/layout/row'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { useUser } from 'web/hooks/use-user'
import { APIError, api, validateIapReceipt } from 'web/lib/api/api'
import { getNativePlatform } from 'web/lib/native/is-native'
import { postMessageToNative } from 'web/lib/native/post-message'
import { checkoutURL } from 'web/lib/service/stripe'
import { db } from 'web/lib/supabase/db'
import { Button } from './buttons/button'
import { Modal } from './layout/modal'
import { AlertBox } from './widgets/alert-box'
import { AmountInput } from './widgets/amount-input'
import { CoinNumber } from './widgets/manaCoinNumber'
import { Col } from './layout/col'
import { shortenNumber } from 'web/lib/util/formatNumber'
import { FaStore } from 'react-icons/fa6'
import router from 'next/router'

export function AddFundsModal(props: {
  open: boolean
  setOpen(open: boolean): void
}) {
  const { open, setOpen } = props
  // TODO: check if they're registered already in gidx & get their status
  // const res = useAPIGetter('get-monitor-status-gidx', {})

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className="bg-canvas-0 text-ink-1000 rounded-md p-8"
    >
      <BuyManaTab onClose={() => setOpen(false)} />
      {/* <Tabs
        trackingName="buy modal tabs"
        className="[&_svg]:hidden" // hide carousel switcher
        tabs={buildArray(
          {
            title: 'Buy mana',
            content: <BuyManaTab onClose={() => setOpen(false)} />,
          },
          {
            title: 'Earn free mana',
            content: (
              <>
                <div className="my-4">Other ways to earn mana:</div>
                <OtherWaysToGetMana />
              </>
            ),
          }
        )}
      /> */}
    </Modal>
  )
}

export function BuyManaTab(props: { onClose: () => void }) {
  const { onClose } = props
  const user = useUser()
  const { isNative, platform } = getNativePlatform()
  const prices = isNative && platform === 'ios' ? IOS_PRICES : MANA_WEB_PRICES
  const [loading, setLoading] = useState<WebManaAmounts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const handleIapReceipt = async <T extends nativeToWebMessageType>(
    type: T,
    data: MesageTypeMap[T]
  ) => {
    if (type === 'iapReceipt') {
      const { receipt } = data as MesageTypeMap['iapReceipt']
      try {
        await validateIapReceipt({ receipt: receipt })
        console.log('iap receipt validated')
        onClose()
      } catch (e) {
        console.log('iap receipt validation error', e)
        setError('Error validating receipt')
      }
    } else if (type === 'iapError') {
      setError('Error during purchase! Try again.')
    }
    setLoading(null)
  }
  useNativeMessages(['iapReceipt', 'iapError'], handleIapReceipt)

  const [url, setUrl] = useState('https://manifold.markets')
  useEffect(() => setUrl(window.location.href), [])

  const totalPurchased = use24hrUsdPurchases(user?.id || '')
  const pastLimit = totalPurchased >= 2500

  return (
    <>
      <Row className="mb-2 items-center gap-1 text-2xl font-semibold">
        <FaStore className="h-6 w-6" />
        Mana Shop
      </Row>
      <div
        className={clsx(
          'text-ink-700 text-sm',
          TWOMBA_ENABLED ? 'mb-5' : 'mb-4'
        )}
      >
        {TWOMBA_ENABLED ? (
          <span>
            Buy mana to trade in your favorite questions. Always free to play,
            no purchase necessary.
          </span>
        ) : (
          <span>Buy mana to trade in your favorite questions.</span>
        )}
      </div>

      {pastLimit && (
        <AlertBox title="Purchase limit" className="my-4">
          You have reached your daily purchase limit. Please try again tomorrow.
        </AlertBox>
      )}

      <div className="grid grid-cols-2 gap-4 gap-y-6">
        {prices.map((amounts) => {
          return isNative && platform === 'ios' ? (
            <PriceTile
              key={`ios-${amounts.mana}`}
              amounts={amounts}
              loading={loading}
              disabled={pastLimit}
              onClick={() => {
                setError(null)
                setLoading(amounts.mana)
                postMessageToNative('checkout', { amount: amounts.price })
              }}
            />
          ) : (
            <form
              key={`web-${amounts.mana}`}
              action={checkoutURL(user?.id || '', amounts.price, url)}
              method="POST"
            >
              <PriceTile
                amounts={amounts}
                loading={loading}
                disabled={pastLimit}
                onClick={() => {
                  if (TWOMBA_ENABLED) {
                    router.push(`/checkout?manaAmount=${amounts.mana}`)
                  }
                }}
                isSubmitButton={!TWOMBA_ENABLED}
              />
            </form>
          )
        })}
      </div>
      <Row className="text-error mt-2 text-sm">{error}</Row>
    </>
  )
}

export function PriceTile(props: {
  amounts: PaymentAmount
  loading: WebManaAmounts | null
  disabled: boolean
  onClick?: () => void
  isSubmitButton?: boolean
}) {
  const { loading, onClick, isSubmitButton, amounts } = props
  const { mana, price, bonus } = amounts

  const isCurrentlyLoading = loading === mana
  const disabled = props.disabled || (loading && !isCurrentlyLoading)
  return (
    <button
      className={clsx(
        'group relative flex w-full flex-col items-center rounded text-center shadow transition-all ',
        disabled
          ? 'pointer-events-none cursor-not-allowed opacity-50'
          : 'opacity-90 ring-2 ring-blue-600 ring-opacity-0 hover:opacity-100 hover:ring-opacity-100',
        isCurrentlyLoading && 'pointer-events-none animate-pulse cursor-wait'
      )}
      type={isSubmitButton ? 'submit' : 'button'}
      onClick={onClick}
    >
      {TWOMBA_ENABLED && (
        <div
          className="absolute -right-2 -top-2
        whitespace-nowrap rounded-full bg-lime-100 px-2 py-0.5
         text-lime-800 shadow transition-colors group-hover:bg-lime-200
          group-hover:text-lime-900 dark:bg-lime-700 dark:text-white
           group-hover:dark:bg-lime-600 group-hover:dark:text-white"
        >
          +
          <CoinNumber
            coinType="sweepies"
            className="font-bold"
            amount={bonus}
            isInline
          />{' '}
          <span className="text-sm">bonus</span>
        </div>
      )}
      <Col className="bg-canvas-50 items-center rounded-t px-4 pb-2 pt-4">
        <Image
          src={
            mana == 10000
              ? '/buy-mana-graphics/10k_mana.png'
              : mana == 25000
              ? '/buy-mana-graphics/25k_mana.png'
              : mana == 100000
              ? '/buy-mana-graphics/100k_mana.png'
              : mana == 1000000
              ? '/buy-mana-graphics/1M_mana.png'
              : ''
          }
          alt={
            mana == 10000
              ? '10k mana'
              : mana == 25000
              ? '25k mana'
              : mana == 100000
              ? '100k mana'
              : mana == 1000000
              ? '1 million mana'
              : ''
          }
          className="w-2/3"
          width={460}
          height={400}
        />

        <div className="text-primary-700 -mt-1 text-xl font-semibold">
          {shortenNumber(mana)}{' '}
        </div>
      </Col>
      <Col className="w-full rounded-b bg-blue-600 px-4 py-1 text-lg font-semibold text-white">
        ${price / 100}
      </Col>
    </button>
  )
}

export const OtherWaysToGetMana = () => {
  return (
    <ul className="border-ink-100 border-t">
      <Item>
        🚀 Browse feed for <CoinNumber amount={AD_REDEEM_REWARD} isInline />{' '}
        from each boosted question
      </Item>
      <Item>
        🔥 Streak bonus (up to{' '}
        <CoinNumber amount={BETTING_STREAK_BONUS_MAX} isInline /> per day)
      </Item>
      <Item url="/referrals">
        👋 Refer a friend for{' '}
        <CoinNumber amount={REFERRAL_AMOUNT} coinType={'spice'} isInline />{' '}
        after their first trade
      </Item>
    </ul>
  )
}

export const SpiceToManaForm = (props: {
  onBack: () => void
  onClose: () => void
}) => {
  const [amount, setAmount] = useState<number | undefined>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async () => {
    if (!amount) return
    setLoading(true)
    try {
      await api('convert-sp-to-mana', { amount })
      setLoading(false)
      setAmount(amount)
      setError(null)
      props.onClose()
    } catch (e) {
      console.error(e)
      setError(e instanceof APIError ? e.message : 'Error converting')
      setLoading(false)
    }
  }

  return (
    <>
      <div className="my-4">Convert at a rate of 1 prize point to 1 mana.</div>
      <div className="text-ink-500 mb-2 text-sm">Amount</div>
      <AmountInput amount={amount} onChangeAmount={setAmount} />
      <div className="mt-4 flex gap-2">
        <Button color="gray" onClick={props.onBack}>
          Back
        </Button>
        <Button
          color="gradient"
          disabled={!amount}
          loading={loading}
          onClick={onSubmit}
        >
          Convert to {ENV_CONFIG.moneyMoniker}
          {amount}
        </Button>
      </div>
      <Row className="text-error mt-2 text-sm">{error}</Row>
    </>
  )
}

const Item = (props: { children: React.ReactNode; url?: string }) => {
  const { children, url } = props
  return (
    <li className="border-ink-100 border-b">
      {url ? (
        <Link href={url}>
          <div className="hover:bg-primary-100 py-3">{children}</div>
        </Link>
      ) : (
        <div className="py-3">{children}</div>
      )}
    </li>
  )
}

export const use24hrUsdPurchases = (userId: string) => {
  const [purchases, setPurchases] = useState<Txn[]>([])

  useEffect(() => {
    run(
      db
        .from('txns')
        .select()
        .eq('category', 'MANA_PURCHASE')
        .eq('to_id', userId)
    ).then((res) => {
      setPurchases(res.data.map(convertTxn))
    })
  }, [userId])

  return (
    sum(
      purchases
        .filter((t) => t.createdTime > Date.now() - DAY_MS)
        .map((t) => t.amount)
    ) / 1000
  )
}
