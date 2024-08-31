import { useEffect } from 'react'
import { useRouter } from 'next/router'

import { useUser } from 'web/hooks/use-user'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'

export const getServerSideProps = redirectIfLoggedOut('/')

export default function MyCalibrationPage() {
  const router = useRouter()
  const user = useUser()

  useEffect(() => {
    if (user) router.replace(`/${user.username}/calibration`)
  }, [user])

  return <></>
}
