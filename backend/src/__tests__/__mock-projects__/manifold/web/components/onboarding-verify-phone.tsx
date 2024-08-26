import { Col } from 'web/components/layout/col'
import { Button } from 'web/components/buttons/button'
import { api } from 'web/lib/api/api'
import { useState } from 'react'
import { Input } from 'web/components/widgets/input'
import { PhoneInput } from 'react-international-phone'
import { toast } from 'react-hot-toast'
import 'react-international-phone/style.css'
import { Title } from 'web/components/widgets/title'
import { Row } from 'web/components/layout/row'
import { PHONE_VERIFICATION_BONUS } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { track } from 'web/lib/service/analytics'
import { CoinNumber } from 'web/components/widgets/manaCoinNumber'

export function OnboardingVerifyPhone(props: { onClose: () => void }) {
  const { onClose } = props
  const requestOTP = async () => {
    setLoading(true)
    await toast
      .promise(
        api('request-otp', {
          phoneNumber,
        }),
        {
          loading: 'Sending code to your phone...',
          success: 'Code sent! Check your phone.',
          error: (e) => e.message,
        }
      )
      .then(() => setPage(1))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }

  const verifyPhone = async () => {
    setLoading(true)
    await toast
      .promise(
        api('verify-phone-number', {
          phoneNumber,
          code: otp,
        }),
        {
          loading: 'Verifying code...',
          success: 'Phone verified!',
          error: (e) => e.message,
        }
      )
      .then(() => onClose())
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))

    await track('verify phone')
  }
  const [loading, setLoading] = useState(false)
  const [otp, setOtp] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [page, setPage] = useState(0)

  return (
    <Col className="text-lg">
      {page === 0 && (
        <Col className="items-center justify-center gap-2">
          <span className={'mb-2 mt-2 text-center text-xl'}>
            Verify your phone number to collect a{' '}
            <CoinNumber
              amount={PHONE_VERIFICATION_BONUS}
              className={'font-bold'}
              isInline
            />{' '}
            signup bonus.
            <br />
            <br />
            <span className={'text-lg italic'}>
              (We won't send you any other messages.)
            </span>
          </span>
          <PhoneInput
            defaultCountry={'us'}
            value={phoneNumber}
            onChange={(phone) => setPhoneNumber(phone)}
            placeholder={'Phone Number'}
            className={'mb-4'}
          />
          <Row
            className={
              'mb-4 mt-4 w-full justify-between px-8 sm:mt-8 sm:justify-center sm:gap-8'
            }
          >
            <Button color={'gray-white'} onClick={onClose}>
              Skip
            </Button>
            <Button
              disabled={phoneNumber.length < 7 || loading}
              loading={loading}
              onClick={requestOTP}
            >
              Request code
            </Button>
          </Row>
        </Col>
      )}
      {page === 1 && (
        <Col className="h-full items-center justify-between gap-2 sm:justify-start">
          <Col className={'gap-2'}>
            <Title>Enter verification code</Title>

            <Input
              type={'number'}
              className={'w-36 self-center'}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
            />
          </Col>
          <Row
            className={
              'mb-4 mt-4 w-full justify-between px-8 sm:mt-8 sm:justify-center sm:gap-8'
            }
          >
            <Button color={'gray-white'} onClick={() => setPage(0)}>
              Back
            </Button>
            <Button
              disabled={otp.length < 6 || loading}
              loading={loading}
              onClick={verifyPhone}
            >
              Verify & claim {formatMoney(PHONE_VERIFICATION_BONUS)}
            </Button>
          </Row>
        </Col>
      )}
    </Col>
  )
}
