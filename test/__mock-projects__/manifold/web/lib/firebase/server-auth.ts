import { User as FirebaseUser } from 'firebase/auth'
import { AUTH_COOKIE_NAME } from 'common/envs/constants'
import { getCookiesFromString } from 'web/lib/util/cookie'
import {
  GetServerSideProps,
  GetServerSidePropsContext,
  GetServerSidePropsResult,
} from 'next'

// client firebase SDK
import { app as clientApp } from './init'

import { setFirebaseUserViaJson } from 'common/firebase-auth'

export const authenticateOnServer = async (user: string | null | undefined) => {
  if (!user) {
    console.debug('User is unauthenticated.')
    return null
  }
  const deserializedUser = JSON.parse(user)
  return setFirebaseUserViaJson(deserializedUser, clientApp)
}

// note that we might want to define these types more generically if we want better
// type safety on next.js stuff... see the definition of GetServerSideProps

type GetServerSidePropsAuthed<P> = (
  context: GetServerSidePropsContext,
  creds: FirebaseUser
) => Promise<GetServerSidePropsResult<P>>

export const redirectIfLoggedIn = <P extends { [k: string]: any }>(
  dest: string,
  fn?: GetServerSideProps<P>
) => {
  return async (ctx: GetServerSidePropsContext) => {
    const creds = await authenticateOnServer(
      getCookiesFromString(ctx.req.headers.cookie ?? '')[AUTH_COOKIE_NAME]
    )
    if (creds == null) {
      if (fn == null) {
        return { props: {} }
      } else {
        const props = await fn(ctx)
        console.debug('Finished getting initial props for rendering.')
        return props
      }
    } else {
      const { nativePlatform } = ctx.query ?? {}
      if (nativePlatform) {
        const nativeDest = '/sign-in-waiting'
        console.debug(`Redirecting native platform to ${nativeDest}.`)
        return { redirect: { destination: nativeDest, permanent: false } }
      }
      console.debug(`Redirecting to ${dest}.`)
      return { redirect: { destination: dest, permanent: false } }
    }
  }
}

export const redirectIfLoggedOut = <P extends { [k: string]: any }>(
  dest: string,
  fn?: GetServerSidePropsAuthed<P>
) => {
  return async (ctx: GetServerSidePropsContext) => {
    const creds = await authenticateOnServer(
      getCookiesFromString(ctx.req.headers.cookie ?? '')[AUTH_COOKIE_NAME]
    )
    if (creds == null) {
      console.debug(`Redirecting to ${dest}.`)
      return { redirect: { destination: dest, permanent: false } }
    } else {
      if (fn == null) {
        return { props: {} }
      } else {
        const props = await fn(ctx, creds)
        console.debug('Finished getting initial props for rendering.')
        return props
      }
    }
  }
}
