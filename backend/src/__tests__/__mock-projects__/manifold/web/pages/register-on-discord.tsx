import { TRADE_TERM } from 'common/envs/constants'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Title } from 'web/components/widgets/title'
import { usePrivateUser } from 'web/hooks/use-user'
import { registerDiscordId } from 'web/lib/api/api'
import { firebaseLogin } from 'web/lib/firebase/users'

const SUCCESS_MESSAGE = `Success! You can now ${TRADE_TERM} with our discord bot using emoji reactions. You can close this page.`
export default function RegisterOnDiscord() {
  const router = useRouter()
  const privateUser = usePrivateUser()
  const [error, setError] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const register = async (discordId: string) =>
    registerDiscordId({ discordId })
      .then(() => setStatus(SUCCESS_MESSAGE))
      .catch((e) => setError(e.message))

  useEffect(() => {
    if (!router.isReady) return
    const { discordId } = router.query
    if (!discordId) {
      setError(
        `No discord id provided, try to ${TRADE_TERM} again with the bot.`
      )
      return
    }
    if (privateUser) {
      // Getting an auth error unless we wait a bit
      setTimeout(() => {
        register(discordId as string)
      }, 1000)
    }
  }, [router, privateUser])

  if (privateUser === undefined) {
    return <LoadingIndicator />
  }
  return (
    <Page trackPageView={'register with discord bot page'}>
      <Col className={'p-2'}>
        <Title>Register with our Discord Bot</Title>
        {!privateUser ? (
          <Button color={'gradient'} onClick={firebaseLogin}>
            Sign in
          </Button>
        ) : status ? (
          <Col className="gap-4 p-1 text-xl">{status}</Col>
        ) : error ? (
          <Col className="gap-4 p-1 text-xl">
            <Row>{error}</Row>
            {router.query.discordId && (
              <Row>
                <Button
                  color={'green'}
                  onClick={() => {
                    setError('')
                    register(router.query.discordId as string)
                  }}
                >
                  Try again
                </Button>
              </Row>
            )}
          </Col>
        ) : (
          <LoadingIndicator />
        )}
        <Row className={'text-ink-600 mt-12 gap-1 text-sm'}>
          Questions? come by our
          <a
            className={'text-indigo-700'}
            href="https://discord.com/invite/eHQBNBqXuh"
          >
            Discord
          </a>
        </Row>
      </Col>
    </Page>
  )
}
