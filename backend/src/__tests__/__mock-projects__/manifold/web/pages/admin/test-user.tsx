import { useEffect, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { randomString } from 'common/util/random'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { getCookie, setCookie } from 'web/lib/util/cookie'
import { Input } from 'web/components/widgets/input'
import { useRouter } from 'next/router'
import { firebaseLogout } from 'web/lib/firebase/users'
import { withTracking } from 'web/lib/service/analytics'
import { useUser } from 'web/hooks/use-user'
import { isAdminId } from 'common/envs/constants'

const KEY = 'TEST_CREATE_USER_KEY'

export default function TestUser() {
  const router = useRouter()
  const user = useUser()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [createUserKey, setCreateUserKey] = useState('')

  useEffect(() => {
    setEmail('manifoldTestNewUser+' + randomString() + '@gmail.com')
    setPassword(randomString())
    const cookie = getCookie(KEY)
    if (cookie) setCreateUserKey(cookie.replace(/"/g, ''))
  }, [])

  const [submitting, setSubmitting] = useState(false)
  const [signingIn, setSigningIn] = useState(false)

  const create = () => {
    if (!createUserKey) return
    setSubmitting(true)
    setCookie(KEY, createUserKey)
    const auth = getAuth()
    createUserWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        setSubmitting(false)
        console.log('SUCCESS creating firebase user', userCredential)
      })
      .catch((error) => {
        setSubmitting(false)
        const errorCode = error.code
        const errorMessage = error.message
        console.log('ERROR creating firebase user', errorCode, errorMessage)
      })
  }

  const login = () => {
    setSigningIn(true)
    const auth = getAuth()
    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        setSubmitting(false)
        console.log('SUCCESS logging in firebase user', userCredential)
        router.push('/home')
      })
      .catch((error) => {
        setSigningIn(false)
        const errorCode = error.code
        const errorMessage = error.message
        console.log('ERROR logging in firebase user', errorCode, errorMessage)
      })
  }

  return (
    <Col className={'text-ink-600 items-center justify-items-center gap-1'}>
      <Title>Test New User Creation</Title>
      <Row className={'gap-2'}>
        <Button
          color={!user || !isAdminId(user.id) ? 'gray-white' : 'indigo'}
          onClick={() => {
            withTracking(firebaseLogout, 'sign out')()
          }}
        >
          Signout
        </Button>
        <Button
          color={!user || isAdminId(user.id) ? 'gray-white' : 'indigo'}
          onClick={() => router.push('/home')}
        >
          Go home
        </Button>
      </Row>
      <Row className={'text-ink-600 text-sm'}>
        Set TEST_CREATE_USER_KEY to{' '}
        <a
          className={'text-primary-700 mx-1'}
          href={
            'https://www.notion.so/manifoldmarkets/Passwords-f460a845ed6d47fc9ea353699adf7c5f?pvs=4#8a11d580b85449a2bba6e400cda8a4c6'
          }
        >
          the proper value
        </a>{' '}
      </Row>
      <ExpandingInput
        value={createUserKey}
        onChange={(e) => setCreateUserKey(e.target.value)}
        className={'w-80'}
        rows={5}
      />
      Email
      <Row className={'text-ink-500'}>{email}</Row>
      Password
      <Row className={'text-ink-500'}>{password}</Row>
      <Button loading={submitting} className={'mt-2'} onClick={create}>
        Submit
      </Button>
      <Row className={'w-full'}>
        <Col className={'w-full items-center'}>
          Email
          <Input
            className={'w-80'}
            value={email}
            onChange={(e) => setEmail(e.target.value || '')}
          />
          Password
          <Input
            className={'w-80'}
            value={password}
            onChange={(e) => setPassword(e.target.value || '')}
          />
          <Button loading={signingIn} className={'mt-2'} onClick={login}>
            Login
          </Button>
        </Col>
      </Row>
    </Col>
  )
}
