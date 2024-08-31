import { Col } from 'web/components/layout/col'
import { Button } from 'web/components/buttons/button'
import { api } from 'web/lib/api/api'
import { useEffect, useState } from 'react'
import { Input } from 'web/components/widgets/input'
import { PhoneInput } from 'react-international-phone'
import { toast } from 'react-hot-toast'
import 'react-international-phone/style.css'
import { Row } from 'web/components/layout/row'
import { track } from 'web/lib/service/analytics'
import { useUser } from 'web/hooks/use-user'

export function RegistrationVerifyPhone(props: {
  cancel: () => void
  next: () => void
}) {
  const { next, cancel } = props
  const user = useUser()
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
      .then(next)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
    track('verify phone')
  }
  const [loading, setLoading] = useState(false)
  const [otp, setOtp] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [page, setPage] = useState(0)
  useEffect(() => {
    if (user?.verifiedPhone) next()
  }, [user?.verifiedPhone])

  return (
    <Col className="p-4 text-lg">
      {page === 0 && (
        <Col className="gap-3">
          <span className={'text-primary-700 mb-3 mt-2 text-2xl'}>
            Verify your phone number
          </span>
          <PhoneInput
            defaultCountry={'us'}
            value={phoneNumber}
            onChange={(phone) => setPhoneNumber(phone)}
            placeholder={'Phone Number'}
            className={'ml-3'}
          />
          <Row className={' mb-4 mt-4 w-full gap-12'}>
            <Button color={'gray-white'} onClick={cancel}>
              Back
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
        <Col className="h-full justify-between gap-2 sm:justify-start">
          <Col className={'gap-2'}>
            <span className={'text-primary-700 mb-3 mt-2 text-2xl'}>
              Enter verification code
            </span>
            <Input
              className={'ml-3 w-36 text-base'}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
            />
          </Col>
          <Row className={' mb-4 mt-4 w-full gap-12'}>
            <Button color={'gray-white'} onClick={() => setPage(0)}>
              Back
            </Button>
            <Button
              disabled={otp.length < 6 || loading}
              loading={loading}
              onClick={verifyPhone}
            >
              Verify
            </Button>
          </Row>
        </Col>
      )}
    </Col>
  )
}
