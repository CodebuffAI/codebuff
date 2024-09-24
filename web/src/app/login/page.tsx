'use client'
import { useState, useEffect } from 'react'
import { BackgroundBeams } from '@/components/ui/background-beams'
import { SignInButton } from '@/components/navbar/sign-in-button'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'

const Home = () => {
  const [mounted, setMounted] = useState(false)
  const searchParams = useSearchParams()
  const authCode = searchParams.get('auth_code')
  const session = useSession()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (authCode && session) {
      fetch(`api/auth/cli`, {
        method: 'POST',
        body: JSON.stringify({
          authCode,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })
      console.log('signed in and added fingerprint')
      return
    }
  }, [authCode, session])

  return (
    <div className="overflow-hidden">
      <BackgroundBeams />

      <main className="container mx-auto px-4 py-20 text-center relative z-10">
        <h1 className="text-5xl md:text-7xl font-bold mb-6">
          Login with OAuth
        </h1>
        <div className="flex flex-col md:flex-row justify-center items-center space-y-4 md:space-y-0 md:space-x-4">
          <SignInButton providerDomain="github.com" providerName="github" />
        </div>
      </main>
    </div>
  )
}

export default Home
