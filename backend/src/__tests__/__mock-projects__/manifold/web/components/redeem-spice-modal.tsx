'use client'
import { useState } from 'react'
import { getNativePlatform } from 'web/lib/native/is-native'
import { Button, baseButtonClasses, buttonClass } from './buttons/button'
import { MODAL_CLASS, Modal } from './layout/modal'

import clsx from 'clsx'
import {
  SPICE_NAME,
  SPICE_TO_CHARITY_DOLLARS,
  SPICE_TO_MANA_CONVERSION_RATE,
  TRADE_TERM,
} from 'common/envs/constants'
import { User } from 'common/user'
import Link from 'next/link'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { APIError, api } from 'web/lib/api/api'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { SpiceToManaForm } from './add-funds-modal'
import { CoinNumber } from './widgets/manaCoinNumber'

export type RedeemSpicePageType = 'main' | 'customMana'

export function RedeemSpiceModal(props: {
  open: boolean
  setOpen(open: boolean): void
  user: User
}) {
  const { open, setOpen, user } = props
  const [page, setPage] = useState<RedeemSpicePageType>('main')
  const spiceBalance = user.spiceBalance
  return (
    <Modal open={open} setOpen={setOpen} className={clsx(MODAL_CLASS)}>
      <Row className="mb-4">
        <span className={clsx('cursor-pointer select-none transition-opacity')}>
          <CoinNumber
            amount={spiceBalance}
            className={clsx('text-ink-1000 text-4xl font-bold transition-all')}
            isInline
            coinClassName="top-[0.1rem]"
            coinType="spice"
          />
          <span
            className={clsx(
              'text-ink-600 ml-1 whitespace-nowrap text-sm transition-all sm:ml-1.5 sm:text-base'
            )}
          >
            {SPICE_NAME}
            {spiceBalance > 1 ? 's' : ''}
          </span>
        </span>
      </Row>
      {page == 'main' ? (
        <MainSpiceRedeemPage user={user} setPage={setPage} setOpen={setOpen} />
      ) : page == 'customMana' ? (
        <SpiceToManaForm
          onBack={() => setPage('main')}
          onClose={() => setOpen(false)}
        />
      ) : (
        <></>
      )}
    </Modal>
  )
}

function MainSpiceRedeemPage(props: {
  user: User
  setPage: (page: RedeemSpicePageType) => void
  setOpen: (open: boolean) => void
}) {
  const { user, setPage, setOpen } = props
  const [disableAllButtons, setDisableAllButtons] = useState(false)
  const { isNative, platform } = getNativePlatform()
  const isNativeIOS = isNative && platform === 'ios'

  return (
    <Col className="gap-4">
      <Col className="bg-canvas-50 gap-4 rounded-lg p-4 pb-1">
        <Row className="gap-2">
          <ManaCoin className="text-7xl" />
          <Col>
            <div className="text-lg font-semibold">Get Mana</div>
            <div className="text-sm">
              Use mana to make more {TRADE_TERM}s to win more {SPICE_NAME}s!
            </div>
          </Col>
        </Row>
        <Row className="w-full gap-2">
          <Button
            onClick={() => {
              setPage('customMana')
            }}
            size="xs"
            color="gray-outline"
            className="h-fit w-1/2 whitespace-nowrap text-xs sm:text-sm"
          >
            Redeem custom amount
          </Button>
          <AllSpiceToManaButton
            user={user}
            setDisableAllButtons={setDisableAllButtons}
            disableAllButtons={disableAllButtons}
            setOpen={setOpen}
          />
        </Row>
      </Col>
      {!isNativeIOS && (
        <Col className="bg-canvas-50 gap-4 rounded-lg p-4 pb-1">
          <Row className="gap-2">
            <img alt="donate" src="/images/donate.png" height={80} width={80} />
            <Col>
              <div className="text-lg font-semibold">Donate to Charity</div>
              <div className="text-sm">
                Donate your {SPICE_NAME}s as USD to a charitable cause!
              </div>
            </Col>
          </Row>
          <Col className="gap-0.5">
            <Link
              className={clsx(
                baseButtonClasses,
                buttonClass('xs', 'indigo'),
                'text-xs sm:text-sm'
              )}
              href="/charity"
            >
              Visit charity page
            </Link>
            <Row className="text-ink-500 w-full justify-end gap-1 whitespace-nowrap text-xs sm:text-sm ">
              <span className="font-semibold text-green-600 dark:text-green-500">
                ${(user.spiceBalance * SPICE_TO_CHARITY_DOLLARS).toFixed(2)}
              </span>
              value
            </Row>
          </Col>
        </Col>
      )}
    </Col>
  )
}
// TODO: TEST THIS
function AllSpiceToManaButton(props: {
  user: User
  disableAllButtons: boolean
  setDisableAllButtons: (disabled: boolean) => void
  setOpen: (open: boolean) => void
}) {
  const { user, disableAllButtons, setDisableAllButtons, setOpen } = props
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const spiceBalance = user.spiceBalance
  const onSubmit = async () => {
    if (!spiceBalance) return
    setLoading(true)
    setDisableAllButtons(true)
    try {
      await api('convert-sp-to-mana', { amount: spiceBalance })
      setLoading(false)
      setError(null)
      setDisableAllButtons(false)
      setOpen(false)
    } catch (e) {
      console.error(e)
      setError(e instanceof APIError ? e.message : 'Error converting')
      setLoading(false)
      setDisableAllButtons(false)
    }
  }
  return (
    <Col className="w-1/2 gap-0.5">
      <Button
        onClick={onSubmit}
        size="xs"
        className="w-full whitespace-nowrap text-xs sm:text-sm"
        loading={loading}
        disabled={disableAllButtons}
      >
        Redeem all for mana
      </Button>
      {!error && (
        <Row className="text-ink-500 w-full justify-end gap-1 whitespace-nowrap text-xs sm:text-sm ">
          <CoinNumber
            amount={user.spiceBalance * SPICE_TO_MANA_CONVERSION_RATE}
            className="text-primary-500 font-semibold"
          />
          mana value
        </Row>
      )}
      {!!error && (
        <Row className="text-scarlet-700 w-full justify-end gap-1 whitespace-nowrap  text-xs sm:text-sm">
          {error}
        </Row>
      )}
    </Col>
  )
}
