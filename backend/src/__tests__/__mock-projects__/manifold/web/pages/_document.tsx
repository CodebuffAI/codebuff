import { Html, Head, Main, NextScript } from 'next/document'
import { ENV_CONFIG } from 'common/envs/constants'
import Script from 'next/script'

export default function Document() {
  return (
    <Html lang="en">
      {/* Prevent flash of light theme before stylesheet loads. See use-theme.ts */}
      <style>
        {`@media (prefers-color-scheme: dark) {
            :root {
              color-scheme: dark;
              background-color: rgb(15 23 41);
              color: white;
            }
          }`}
      </style>
      <Head>
        <link rel="icon" href={ENV_CONFIG.faviconPath} />
        <Script src="/init-theme.js" strategy="beforeInteractive" />
      </Head>
      <body className="bg-canvas-50 text-ink-1000">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
