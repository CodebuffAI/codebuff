'use client'
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth'
import Script from 'next/script'
import { useEffect } from 'react'
import { useUser } from 'web/hooks/use-user'
import { auth } from './users'

async function handleResponse(response: any) {
  const idToken = response.credential
  const credential = GoogleAuthProvider.credential(idToken)
  try {
    const result = await signInWithCredential(auth, credential)
    console.log(result.user)
  } catch (error) {
    console.error('could not log in via onetap', error)
  }
}

const initGSI = () => {
  ;(window as any).google?.accounts.id.initialize({
    client_id:
      '128925704902-bpcbnlp2gt73au3rrjjtnup6cskr89p0.apps.googleusercontent.com',
    callback: handleResponse,
    // auto_select: true,
    // cancel_on_tap_outside: false,
    itp_support: true,
    prompt_parent_id: 'signup-prompt',
  })
}

export const GoogleOneTapSetup = () => {
  useEffect(() => {
    setTimeout(() => initGSI(), 500)
  }, [])

  return <Script src="https://accounts.google.com/gsi/client" />
}

export const GoogleOneTapLogin = (props: { className?: string }) => {
  const user = useUser()

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!user && (window as any).google?.accounts?.id?.prompt) {
        ;(window as any).google.accounts.id.prompt()
      }
    }, 1000)

    return () => clearTimeout(timeoutId)
  }, [user])

  return <div id="signup-prompt" className={props.className} />
}
