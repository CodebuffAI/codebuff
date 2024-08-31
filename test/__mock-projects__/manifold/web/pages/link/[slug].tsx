import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { claimManalink } from 'web/lib/api/api'
import {
  ManalinkInfo,
  getManalink,
  getNumClaims,
} from 'web/lib/supabase/manalinks'
import { ManalinkCard } from 'web/components/manalink-card'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { User } from 'common/user'
import { ENV_CONFIG } from 'common/envs/constants'
import { Page } from 'web/components/layout/page'
import { formatMoney } from 'common/util/format'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { getUserById } from 'web/lib/supabase/users'

export const getServerSideProps = redirectIfLoggedOut('/', async (ctx) => {
  const slug = ctx.params?.slug
  if (!slug || typeof slug !== 'string') {
    return { notFound: true }
  }
  const adminDb = await initSupabaseAdmin()
  const [link, numClaims] = await Promise.all([
    getManalink(slug, adminDb),
    getNumClaims(slug, adminDb),
  ])
  if (link == null) {
    return { notFound: true }
  }
  return { props: { link, numClaims } }
})

export default function ClaimPage(props: {
  link: ManalinkInfo
  numClaims: number
}) {
  const { link, numClaims } = props
  const user = useUser()
  const router = useRouter()
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  useReferral(user, link)

  return (
    <Page trackPageView={'manalink slug page'}>
      <SEO
        title="Send Mana"
        description="Send mana to anyone via link!"
        url="/send"
      />
      <div className="mx-auto max-w-xl px-2">
        <Row className="items-center justify-between">
          <Title>Claim {formatMoney(link.amount)} mana </Title>
          <div className="my-auto"></div>
        </Row>

        <ManalinkCard info={link} numClaims={numClaims} />

        {error && (
          <section className="text-scarlet-500 my-5">
            <p>Failed to claim manalink.</p>
            <p>{error}</p>
          </section>
        )}

        <Row className="items-center">
          <Button
            onClick={async () => {
              setClaiming(true)
              try {
                if (user == null) {
                  await firebaseLogin()
                  setClaiming(false)
                  return
                }
                if (user?.id == link.creatorId) {
                  throw new Error("You can't claim your own manalink.")
                }
                await claimManalink({ slug: link.slug })
                user && router.push(`/${user.username}?claimed-mana=yes`)
              } catch (e) {
                console.log(e)
                const message =
                  e && e instanceof Object ? e.toString() : 'An error occurred.'
                setError(message)
              }
              setClaiming(false)
            }}
            disabled={claiming}
            size="lg"
          >
            {user
              ? `Claim ${ENV_CONFIG.moneyMoniker}${link.amount}`
              : 'Login to claim'}
          </Button>
        </Row>
      </div>
    </Page>
  )
}

const useReferral = (user: User | undefined | null, link: ManalinkInfo) => {
  const [creatorUsername, setCreatorUsername] = useState<string | undefined>(
    undefined
  )

  useEffect(() => {
    getUserById(link.creatorId).then((c) => setCreatorUsername(c?.username))
  }, [link])

  useSaveReferral(user, { defaultReferrerUsername: creatorUsername })
}
