import { LinkIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { PrivateUser, User } from 'common/user'
import { MouseEventHandler, ReactNode, useEffect, useState } from 'react'

import toast from 'react-hot-toast'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import {
  getDockURLForUser,
  getOverlayURLForUser,
  linkTwitchAccountRedirect,
  updateBotEnabledForUser,
} from 'web/lib/twitch/link-twitch-account'
import { copyToClipboard } from 'web/lib/util/copy'
import { formatMoney } from 'common/util/format'
import { REFERRAL_AMOUNT, STARTING_BALANCE } from 'common/economy'
import { ENV_CONFIG, TRADE_TERM, TRADING_TERM } from 'common/envs/constants'
import { CopyLinkRow } from 'web/components/buttons/copy-link-button'
import { api } from 'web/lib/api/api'
import { capitalize } from 'lodash'

export default function TwitchLandingPage() {
  const user = useUser()
  useSaveReferral(user)

  const privateUser = usePrivateUser()

  return (
    <Page trackPageView={'twitch landing page'}>
      <SEO
        title="Manifold on Twitch"
        description={`Get more out of Twitch with play-money ${TRADING_TERM} questions.`}
      />
      <div className="px-4 pt-2 md:mt-0 lg:hidden">
        <ManifoldLogo />
      </div>

      <Col className="text-ink-600 bg-canvas-0 max-w-3xl gap-8 rounded p-4 shadow-md sm:mx-auto sm:p-10">
        <TwitchPlaysManifoldMarkets user={user} privateUser={privateUser} />
        <TwitchChatCommands />
        <SetUpBot user={user} privateUser={privateUser} />
      </Col>
    </Page>
  )
}

function ButtonGetStarted(props: {
  user?: User | null
  privateUser?: PrivateUser | null
  buttonClass?: string
  spinnerClass?: string
}) {
  const { user, privateUser, buttonClass, spinnerClass } = props

  const [isLoading, setLoading] = useState(false)

  const needsRelink =
    privateUser?.twitchInfo?.twitchName &&
    privateUser?.twitchInfo?.needsRelinking

  const [waitingForUser, setWaitingForUser] = useState(false)
  useEffect(() => {
    if (waitingForUser && user && privateUser) {
      setWaitingForUser(false)

      if (privateUser.twitchInfo?.twitchName) return // If we've already linked Twitch, no need to do so again

      setLoading(true)

      linkTwitchAccountRedirect(user, privateUser).then(() => {
        setLoading(false)
      })
    }
  }, [user, privateUser, waitingForUser])

  const callback =
    user && privateUser
      ? () => linkTwitchAccountRedirect(user, privateUser)
      : async () => {
          await firebaseLogin()
          setWaitingForUser(true)
        }

  const getStarted = async () => {
    try {
      setLoading(true)

      const promise = callback()
      track('twitch page button click')
      await promise
    } catch (e) {
      console.error(e)
      toast.error('Failed to sign up. Please try again later.')
    } finally {
      setLoading(false)
    }
  }
  return isLoading ? (
    <LoadingIndicator
      spinnerClassName={clsx('!w-11 !h-11 my-4', spinnerClass)}
    />
  ) : (
    <Button
      size="xl"
      color={needsRelink ? 'red' : 'gradient'}
      className={clsx('my-4 self-center !px-16', buttonClass)}
      onClick={getStarted}
    >
      {needsRelink ? 'API key updated: relink Twitch' : 'Start playing'}
    </Button>
  )
}

function TwitchPlaysManifoldMarkets(props: {
  user?: User | null
  privateUser?: PrivateUser | null
}) {
  const { user, privateUser } = props

  const twitchInfo = privateUser?.twitchInfo
  const twitchUser = twitchInfo?.twitchName

  return (
    <div>
      <Row className="mb-4">
        <img
          src="/twitch-glitch.svg" // logo
          className="mb-[0.4rem] mr-4 inline h-10 w-10"
          alt=""
        />
        <Title className={'!-my-0 md:block'}>Twitch plays manifold</Title>
      </Row>
      <Col className="mb-4 gap-4">
        Start {TRADING_TERM} on Twitch now by linking your account and typing
        commands in chat!
        {twitchUser && !twitchInfo.needsRelinking ? (
          <Button
            size="xl"
            color="green"
            className="my-4 self-center !border-none"
          >
            Account connected: {twitchUser}
          </Button>
        ) : (
          <ButtonGetStarted user={user} privateUser={privateUser} />
        )}
      </Col>
      <Col className="gap-4">
        <Subtitle text="How it works" />
        <div>
          Similar to Twitch channel point predictions, Manifold allows you to
          create a play-money prediction markets on any question you like and
          feature it in your stream.
        </div>
        <div>
          The key difference is that Manifold's questions function more like a
          stock market and viewers can buy and sell shares over the course of
          the event and not just at the start. The question will eventually
          resolve to yes or no at which point the winning shareholders will
          receive their profit.
        </div>
        <div>
          Instead of Twitch channel points we use our own play money, mana (
          {ENV_CONFIG.moneyMoniker}). All viewers start with{' '}
          {formatMoney(STARTING_BALANCE)} and can earn more for free by{' '}
          {TRADING_TERM} well.
        </div>
      </Col>
    </div>
  )
}

function Subtitle(props: { text: string }) {
  const { text } = props
  return <div className="text-2xl">{text}</div>
}

function Command(props: { command: string; desc: string }) {
  const { command, desc } = props
  return (
    <div>
      <p className="inline font-bold">{'!' + command}</p>
      {' - '}
      <p className="inline">{desc}</p>
    </div>
  )
}

function TwitchChatCommands() {
  return (
    <div>
      <Title className="md:block">Twitch Chat Commands</Title>
      <Col className="gap-4">
        <Subtitle text="For Chat" />
        <Command
          command="y#"
          desc={`${capitalize(TRADE_TERM)}s # amount of ${
            ENV_CONFIG.moneyMoniker
          } on yes, for example !y20 would ${TRADE_TERM} ${
            ENV_CONFIG.moneyMoniker
          }20 on yes.`}
        />
        <Command
          command="n#"
          desc={`${capitalize(TRADE_TERM)}s # amount of ${
            ENV_CONFIG.moneyMoniker
          } on no, for example !n30 would ${TRADE_TERM} ${
            ENV_CONFIG.moneyMoniker
          }30 on no.`}
        />
        <Command
          command="sell"
          desc="Sells all shares you own. Using this command causes you to
          cash out early based on the current probability.
          Shares will always be worth the most if you wait for a favourable resolution. But, selling allows you to lower risk, or trade throughout the event which can maximise earnings."
        />
        <Command
          command="position"
          desc="Shows how many shares you own in the current question and what your fixed payout is."
        />
        <Command
          command="balance"
          desc={`Shows how much ${ENV_CONFIG.moneyMoniker} your account has.`}
        />

        <div className="mb-4" />

        <Subtitle text="For Mods/Streamer" />

        <div>
          We recommend streamers sharing the link to the control dock with their
          mods. Alternatively, chat commands can be used to control questions.{' '}
        </div>

        <Command
          command="create [question]"
          desc="Creates and features a question. Be careful, this will replace any question that is currently featured."
        />
        <Command command="resolve yes" desc="Resolves the question as 'Yes'." />
        <Command command="resolve no" desc="Resolves the question as 'No'." />
        <Command
          command="resolve na"
          desc="Cancels the question and refunds everyone their mana."
        />
        <Command
          command="unfeature"
          desc="Unfeatures the question. The question will still be open on our site and available to be refeatured again. If you plan to never interact with a question again we recommend resolving to N/A and not this command."
        />
      </Col>
    </div>
  )
}

function BotSetupStep(props: {
  stepNum: number
  buttonName?: string
  buttonOnClick?: MouseEventHandler
  overrideButton?: ReactNode
  children: ReactNode
}) {
  const { stepNum, buttonName, buttonOnClick, overrideButton, children } = props
  return (
    <Col className="flex-1">
      {(overrideButton || buttonName) && (
        <>
          {overrideButton ?? (
            <Button
              size={'md'}
              color={'green'}
              className="!border-none"
              onClick={buttonOnClick}
            >
              {buttonName}
            </Button>
          )}
          <Spacer h={4} />
        </>
      )}
      <div>
        <p className="inline font-bold">Step {stepNum}. </p>
        {children}
      </div>
    </Col>
  )
}

function CopyButton(props: { link: string; text: string }) {
  const { link, text } = props
  const toastTheme = {
    className: '!bg-teal-600 !text-ink-1000',
    icon: <LinkIcon className="mr-2 h-6 w-6" aria-hidden="true" />,
  }
  const copyLinkCallback = async () => {
    copyToClipboard(link)
    toast.success(text + ' copied', toastTheme)
  }
  return (
    <a href={link} onClick={(e) => e.preventDefault()}>
      <Button
        size={'md'}
        color={'green'}
        className="w-full !border-none"
        onClick={copyLinkCallback}
      >
        {text}
      </Button>
    </a>
  )
}

function BotConnectButton(props: {
  privateUser: PrivateUser | null | undefined
}) {
  const { privateUser } = props
  const [loading, setLoading] = useState(false)

  const updateBotConnected = (connected: boolean) => async () => {
    if (!privateUser) return
    const twitchInfo = privateUser.twitchInfo
    if (!twitchInfo) return

    const error = connected
      ? 'Failed to add bot to your channel'
      : 'Failed to remove bot from your channel'
    const success = connected
      ? 'Added bot to your channel'
      : 'Removed bot from your channel'

    setLoading(true)
    toast.promise(
      updateBotEnabledForUser(privateUser, connected)
        .then(() =>
          api('save-twitch', { twitchInfo: { botEnabled: connected } })
        )
        .finally(() => setLoading(false)),
      { loading: 'Updating bot settings...', error, success },
      {
        loading: {
          className: '!max-w-sm',
        },
        success: {
          className:
            '!bg-teal-600 !transition-all !duration-500 !text-ink-0 !max-w-sm',
        },
        error: {
          className:
            '!bg-scarlet-400 !transition-all !duration-500 !text-ink-0 !max-w-sm',
        },
      }
    )
  }

  return (
    <>
      {privateUser?.twitchInfo?.botEnabled ? (
        <Button
          color="red"
          onClick={updateBotConnected(false)}
          loading={loading}
        >
          Remove bot from channel
        </Button>
      ) : (
        <Button
          color="green"
          onClick={updateBotConnected(true)}
          loading={loading}
          className="border-none"
        >
          Add bot to your channel
        </Button>
      )}
    </>
  )
}

function SetUpBot(props: {
  user?: User | null
  privateUser?: PrivateUser | null
}) {
  const { user, privateUser } = props
  const twitchLinked =
    privateUser &&
    privateUser?.twitchInfo?.twitchName &&
    !privateUser?.twitchInfo?.needsRelinking
      ? true
      : undefined

  return (
    <>
      <Title className={'!mb-0 md:block'}>
        Set up the bot for your own stream
      </Title>
      <Col className="gap-4">
        <img
          src="/twitch-bot-obs-screenshot.jpg"
          className="rounded-md border-l border-r border-t shadow-md"
          alt='screenshot of a stream with a game on the right and Manifold console on the right above chat. The console says "Resolve market", the market name, YES NO N/A buttons, a resolve button, and an unfeature market button.'
        />
        To add the bot to your stream make sure you have logged in then follow
        the steps below.
        {twitchLinked && privateUser ? (
          <div className="flex flex-col gap-6 sm:flex-row">
            <BotSetupStep
              stepNum={1}
              overrideButton={
                twitchLinked && <BotConnectButton privateUser={privateUser} />
              }
            >
              Use the button above to add the bot to your channel. Then mod it
              by typing in your Twitch chat: <b>/mod ManifoldBot</b>
              <br />
              If the bot is not modded it will not be able to respond to
              commands properly.
            </BotSetupStep>
            <BotSetupStep
              stepNum={2}
              overrideButton={
                <CopyButton
                  link={getOverlayURLForUser(privateUser)}
                  text={'Overlay link'}
                />
              }
            >
              Create a new browser source in your streaming software such as
              OBS. Paste in the above link and type in the desired size. We
              recommend 450x375.
            </BotSetupStep>
            <BotSetupStep
              stepNum={3}
              overrideButton={
                <CopyButton
                  link={getDockURLForUser(privateUser)}
                  text={'Control dock link'}
                />
              }
            >
              The bot can be controlled entirely through chat. But we made an
              easy to use control panel. Share the link with your mods or embed
              it into your OBS as a custom dock.
            </BotSetupStep>
          </div>
        ) : (
          <ButtonGetStarted
            user={user}
            privateUser={privateUser}
            buttonClass={'!my-0'}
            spinnerClass={'!my-0'}
          />
        )}
        <div>
          Need help? Contact SirSalty#5770 in Discord or email
          david@manifold.markets
        </div>
        {user && (
          <Col className="mb-8 p-4">
            <div className="text-ink-700 mb-2 text-base">
              Share your questions! Earn a {formatMoney(REFERRAL_AMOUNT)}{' '}
              referral bonus if a new user signs up and places a trade using the
              link.
            </div>

            <CopyLinkRow
              url={'https://manifold.markets/twitch?referrer=' + user?.username}
              eventTrackingName="copy twitch link"
            />
          </Col>
        )}
      </Col>
    </>
  )
}
