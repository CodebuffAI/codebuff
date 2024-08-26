import Head from 'next/head'

/** Exclude page from search results */
export function NoSEO() {
  return (
    <Head>
      <meta name="robots" content="noindex,follow" />
    </Head>
  )
}
