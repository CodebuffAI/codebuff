import { Page } from 'web/components/layout/page'
import { Spacer } from 'web/components/layout/spacer'
import {
  Content,
  TextEditor,
  useTextEditor,
} from 'web/components/widgets/editor'
import { PencilIcon } from '@heroicons/react/solid'
import { Button } from 'web/components/buttons/button'
import { useState } from 'react'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { ENV_CONFIG } from 'common/envs/constants'
import Custom404 from 'web/pages/404'
import { UserLink } from 'web/components/widgets/user-link'
import { SEO } from 'web/components/SEO'
import { richTextToString } from 'common/util/parse'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { convertSQLtoTS, run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { Row as rowFor } from 'common/supabase/utils'
import { JSONContent } from '@tiptap/core'
import { Visibility } from 'common/contract'
import { DisplayUser, getUserById } from 'web/lib/supabase/users'

export async function getStaticProps(props: { params: { slug: string } }) {
  const { slug } = props.params

  const post = await getPostBySlug(slug)
  const creator = post ? await getUserById(post.creatorId) : null

  const watched: string[] = []
  const skipped: string[] = []

  return {
    props: {
      post,
      creator,
      comments: [],
      watched,
      skipped,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function PostPage(props: {
  post: OldPost | null
  creator: DisplayUser | null
  watched?: string[] //user ids
  skipped?: string[] //user ids
}) {
  const { creator, post } = props

  if (!post || !creator) {
    return <Custom404 />
  }
  const shareUrl = `https://${ENV_CONFIG.domain}${postPath(post.slug)}`

  return (
    <Page trackPageView={'post slug page'}>
      <SEO
        title={post.title}
        description={richTextToString(post.content)}
        url={'/old-posts/' + post.slug}
      />
      <div className="mx-auto mt-1 flex w-full max-w-2xl flex-col">
        <div className="h-2" />
        <Row className="mt-4 items-center">
          <div className="flex px-2">
            <div className="text-ink-500 mr-1">Created by</div>
            <UserLink className="text-ink-700" user={creator} />
          </div>
          <Row className="items-center sm:pr-2">
            <CopyLinkOrShareButton
              tooltip="Copy link to post"
              url={shareUrl}
              eventTrackingName={'copy post link'}
            />
          </Row>
        </Row>

        <Spacer h={2} />
        <div className="bg-canvas-0 rounded-lg px-6 py-4 sm:py-0">
          <div className="flex w-full flex-col py-2">
            <RichEditPost post={post} canEdit={false} />
          </div>
        </div>

        <Spacer h={4} />
        <div className="rounded-lg px-6 py-4 sm:py-0"></div>
      </div>
    </Page>
  )
}

function RichEditPost(props: {
  post: OldPost
  canEdit: boolean
  children?: React.ReactNode
}) {
  const { post, canEdit, children } = props
  const [editing, setEditing] = useState(false)

  const editor = useTextEditor({
    defaultValue: post.content,
    key: `post ${post?.id || ''}`,
    size: 'lg',
  })

  return editing ? (
    <>
      <TextEditor editor={editor} />
      <Spacer h={2} />
      <Row className="gap-2">
        <Button color="gray" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </Row>
    </>
  ) : (
    <Col>
      <Content size="lg" content={post.content} />
      {canEdit && (
        <Row className="place-content-end">
          <Button
            color="gray-white"
            size="xs"
            onClick={() => {
              setEditing(true)
              editor?.commands.focus('end')
            }}
          >
            <PencilIcon className="inline h-4 w-4" />
          </Button>
          {children}
        </Row>
      )}
    </Col>
  )
}

function postPath(postSlug: string) {
  return `/old-posts/${postSlug}`
}

async function getPostBySlug(slug: string) {
  const { data } = await run(
    db.from('old_posts').select().eq('data->>slug', slug)
  )
  if (data && data.length > 0) {
    return convertPost(data[0])
  }
  return null
}

const convertPost = (sqlPost: rowFor<'old_posts'>) =>
  convertSQLtoTS<'old_posts', OldPost>(sqlPost, {
    created_time: false, // grab from data
  })

/** @deprecated */
type OldPost = {
  id: string
  type?: string
  title: string
  /** @deprecated */
  subtitle?: string
  content: JSONContent
  creatorId: string // User id
  createdTime: number
  slug: string

  // denormalized user fields
  creatorName: string
  creatorUsername: string
  creatorAvatarUrl?: string

  likedByUserIds?: string[]
  likedByUserCount?: number

  /** @deprecated */
  commentCount?: number
  /** @deprecated */
  isGroupAboutPost?: boolean
  groupId?: string
  featuredLabel?: string
  visibility: Visibility
}
