'use client'
import { Page } from 'web/components/layout/page'
import {
  NewContractPanel,
  NewQuestionParams,
} from 'web/components/new-contract/new-contract-panel'
import { Title } from 'web/components/widgets/title'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useUser } from 'web/hooks/use-user'
import { useDefinedSearchParams } from 'web/hooks/use-defined-search-params'

export default function Create() {
  useRedirectIfSignedOut()

  const user = useUser()
  const { searchParams } = useDefinedSearchParams()
  const paramsEntries = Object.fromEntries(searchParams.entries())
  const params = searchParams
    ? (Object.fromEntries(
        Object.keys(paramsEntries).map((key) => [
          key,
          JSON.parse(paramsEntries[key] || 'null'),
        ])
      ).params as NewQuestionParams)
    : ({} as NewQuestionParams)
  if (!user) return <div />

  if (user.isBannedFromPosting)
    return (
      <Page trackPageView={'banned from create page'}>
        <div className="mx-auto w-full max-w-2xl">
          <div className="rounded-lg px-6 py-4 sm:py-0">
            <Title>Create a question</Title>
            <p>Sorry, you are currently banned from creating a question.</p>
          </div>
        </div>
      </Page>
    )

  return (
    <Page trackPageView={'create page'}>
      <NewContractPanel params={params} creator={user} />
    </Page>
  )
}
