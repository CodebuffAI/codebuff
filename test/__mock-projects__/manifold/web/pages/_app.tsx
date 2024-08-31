import type { AppProps } from 'next/app'
import Head from 'next/head'
import Script from 'next/script'
import { useEffect } from 'react'
import { AuthProvider, AuthUser } from 'web/components/auth-context'
import { NativeMessageListener } from 'web/components/native-message-listener'
import { useHasLoaded } from 'web/hooks/use-has-loaded'
import '../styles/globals.css'
import { getIsNative } from 'web/lib/native/is-native'
import { Major_Mono_Display, Figtree } from 'next/font/google'
import { GoogleOneTapSetup } from 'web/lib/firebase/google-onetap-login'
import clsx from 'clsx'
import { useRefreshAllClients } from 'web/hooks/use-refresh-all-clients'
import { postMessageToNative } from 'web/lib/native/post-message'
import { useThemeManager } from 'web/hooks/use-theme'
import { ENV_CONFIG, TRADE_TERM } from 'common/envs/constants'
import { SweepstakesProvider } from 'web/components/sweestakes-context'
import { capitalize } from 'lodash'

// See https://nextjs.org/docs/basic-features/font-optimization#google-fonts
// and if you add a font, you must add it to tailwind config as well for it to work.

const logoFont = Major_Mono_Display({
  weight: ['400'],
  variable: '--font-logo',
  subsets: ['latin'],
})

const mainFont = Figtree({
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-main',
  subsets: ['latin'],
})

function firstLine(msg: string) {
  const newlineIndex = msg.indexOf('\n')
  if (newlineIndex === -1) {
    return msg
  }
  return msg.substring(0, newlineIndex)
}

// It can be very hard to see client logs on native, so send them manually
if (getIsNative()) {
  const log = console.log.bind(console)
  console.log = (...args) => {
    postMessageToNative('log', { args })
    log(...args)
  }
  console.error = (...args) => {
    postMessageToNative('log', { args })
    log(...args)
  }
}

function printBuildInfo() {
  // These are undefined if e.g. dev server
  if (process.env.NEXT_PUBLIC_VERCEL_ENV) {
    const env = process.env.NEXT_PUBLIC_VERCEL_ENV
    const msg = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_MESSAGE
    const owner = process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER
    const repo = process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG
    const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
    const url = `https://github.com/${owner}/${repo}/commit/${sha}`
    console.info(`Build: ${env} / ${firstLine(msg || '???')} / ${url}`)
  }
}

// specially treated props that may be present in the server/static props
type ManifoldPageProps = { auth?: AuthUser }

function MyApp({ Component, pageProps }: AppProps<ManifoldPageProps>) {
  useEffect(printBuildInfo, [])
  useHasLoaded()
  useRefreshAllClients()

  useThemeManager()

  const title = 'Manifold'
  const description = `Manifold is a social prediction game. ${capitalize(
    TRADE_TERM
  )} on news, politics, tech, & AI with play money. Or create your own prediction market.`

  return (
    <>
      <Head>
        <title>{title}</title>

        <meta
          property="og:title"
          name="twitter:title"
          content={title}
          key="title"
        />
        <meta name="description" content={description} key="description1" />
        <meta
          property="og:description"
          name="twitter:description"
          content={description}
          key="description2"
        />
        <meta property="og:url" content="https://manifold.markets" key="url" />
        <meta property="og:site_name" content="Manifold" />
        <meta name="twitter:card" content="summary" key="card" />
        <meta name="twitter:site" content="@manifoldmarkets" />
        <meta
          name="twitter:image"
          content="https://manifold.markets/logo.png"
          key="image2"
        />
        <meta
          property="og:image"
          content="https://manifold.markets/logo-cover.png"
          key="image1"
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1,maximum-scale=1, user-scalable=no"
        />
        <meta name="apple-itunes-app" content="app-id=6444136749" />
        <link
          rel="search"
          type="application/opensearchdescription+xml"
          href="https://manifold.markets/opensearch.xml"
          title="Manifold"
        />
      </Head>
      <div
        className={clsx(
          'font-figtree contents font-normal',
          logoFont.variable,
          mainFont.variable
        )}
      >
        <AuthProvider serverUser={pageProps.auth}>
          <SweepstakesProvider>
            <NativeMessageListener />
            <Component {...pageProps} />
          </SweepstakesProvider>
        </AuthProvider>
        {/* Workaround for https://github.com/tailwindlabs/headlessui/discussions/666, to allow font CSS variable */}
        <div id="headlessui-portal-root">
          <div />
        </div>
      </div>

      <GoogleOneTapSetup />

      {/* Umami, for pageview analytics on https://analytics.umami.is/share/ARwUIC9GWLNyowjq/Manifold%20Markets */}
      <Script
        src="https://analytics.umami.is/script.js"
        data-website-id="ee5d6afd-5009-405b-a69f-04e3e4e3a685"
      />

      {/* Hotjar, for recording user sessions */}
      <Script
        id="hotjar"
        dangerouslySetInnerHTML={{
          __html: `
    (function(h,o,t,j,a,r){
        h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
        h._hjSettings={hjid:2968940,hjsv:6};
        a=o.getElementsByTagName('head')[0];
        r=o.createElement('script');r.async=1;
        r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
        a.appendChild(r);
    })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`,
        }}
      />

      <Script
        id="fbpx"
        dangerouslySetInnerHTML={{
          __html: `
          !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '254770557407697');
  fbq('track', 'PageView');`,
        }}
      />

      <Script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${ENV_CONFIG.googleAnalyticsId}`}
      />
      <Script
        id="gaw"
        dangerouslySetInnerHTML={{
          __html: `
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${ENV_CONFIG.googleAnalyticsId}');`,
        }}
      />
    </>
  )
}

export default MyApp
