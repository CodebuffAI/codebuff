import { Page } from 'web/components/layout/page'
import { useRouter } from 'next/router'
import { BackButton } from 'web/components/contract/back-button'
import { Row } from 'web/components/layout/row'
import { PublicChat } from 'web/components/chat/public-chat'

export default function PublicMessagesPage() {
  const router = useRouter()
  const { channelId } = router.query as { channelId: string }
  return (
    <Page trackPageView={'public messages page'}>
      <Row
        className={
          'border-ink-200 bg-canvas-50 items-center gap-1 border-b py-2'
        }
      >
        <BackButton />
      </Row>
      <PublicChat channelId={channelId} />
    </Page>
  )
}
