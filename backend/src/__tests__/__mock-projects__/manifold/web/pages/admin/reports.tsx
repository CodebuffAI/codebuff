import { JSONContent } from '@tiptap/core'
import { contractPath } from 'common/contract'
import { Row, millisToTs, run, tsToMillis } from 'common/supabase/utils'
import { filterDefined } from 'common/util/array'
import { groupBy } from 'lodash'
import Link from 'next/link'
import { NoSEO } from 'web/components/NoSEO'
import { Page } from 'web/components/layout/page'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { UserHovercard } from 'web/components/user/user-hovercard'
import { Avatar } from 'web/components/widgets/avatar'
import { Content } from 'web/components/widgets/editor'
import { PaginationNextPrev } from 'web/components/widgets/pagination'
import { Title } from 'web/components/widgets/title'
import { Tooltip } from 'web/components/widgets/tooltip'
import { BannedBadge, UserLink } from 'web/components/widgets/user-link'
import { useAdmin } from 'web/hooks/use-admin'
import { usePagination } from 'web/hooks/use-pagination'
import { api } from 'web/lib/api/api'
import { getComment } from 'web/lib/supabase/comments'
import { db } from 'web/lib/supabase/db'
import { DisplayUser, getUserById } from 'web/lib/supabase/users'

const PAGE_SIZE = 20

export async function getStaticProps() {
  try {
    const reports = await getReports({ limit: PAGE_SIZE })
    return { props: { reports }, revalidate: 60 }
  } catch (e) {
    console.error(e)
    return { props: { reports: [] }, revalidate: 60 }
  }
}

export default function Reports(props: { reports: LiteReport[] }) {
  const pagination = usePagination<LiteReport>({
    pageSize: PAGE_SIZE,
    q: getReports,
    prefix: props.reports,
  })

  const reportsByContent = Object.values(groupBy(pagination.items, 'contentId'))

  const isAdmin = useAdmin()
  if (!isAdmin) return <></>

  return (
    <Page trackPageView={false} className="px-2">
      <NoSEO />
      <Title>Reports</Title>
      <div className="flex w-full flex-col">
        <PaginationNextPrev {...pagination} />

        {!pagination.isLoading &&
          reportsByContent.map((reports) => {
            const { slug, text, owner, contentId, contentType, createdTime } =
              reports[0]

            return (
              <div key={contentId} className="my-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserHovercard userId={owner.id}>
                      <div className="flex items-center">
                        <Avatar
                          username={owner.username}
                          avatarUrl={owner.avatarUrl}
                          size="sm"
                        />
                        <UserLink user={owner} className="text-ink-800 ml-2" />
                        {owner.isBannedFromPosting && <BannedBadge />}
                      </div>
                    </UserHovercard>

                    <div>
                      {contentType === 'user' ? (
                        'was reported'
                      ) : (
                        <>
                          <Tooltip
                            text={reports.map(({ reporter }, i) => (
                              <div key={i} className="flex gap-1">
                                <Avatar
                                  username={reporter.username}
                                  avatarUrl={reporter.avatarUrl}
                                  size="xs"
                                />
                                <UserLink user={reporter} />
                              </div>
                            ))}
                          >
                            {/* TODO: show reporting users? */}
                            was reported
                            {reports.length > 1 && (
                              <> {reports.length} times</>
                            )}{' '}
                            for this{' '}
                          </Tooltip>
                          <Link
                            href={slug}
                            className="text-primary-700 text-md my-1"
                          >
                            {contentType}
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                  {createdTime && <RelativeTimestamp time={createdTime} />}
                </div>

                {contentType !== 'user' && (
                  <div className="bg-canvas-0 my-2 max-h-[300px] overflow-y-auto rounded-lg p-2">
                    <Content content={text} />
                  </div>
                )}

                <div className="mt-2">
                  {reports
                    .filter((report) => report.reasonsDescription)
                    .map((report) => (
                      <div key={report.id} className="text-ink-700">
                        {report.reasonsDescription}
                      </div>
                    ))}
                </div>
              </div>
            )
          })}
        {!pagination.isLoading && (
          <PaginationNextPrev {...pagination} className="mb-8" />
        )}
      </div>
    </Page>
  )
}

const getReports = async (p: {
  limit: number
  offset?: number
  after?: { createdTime?: number | undefined }
}) => {
  const q = db
    .from('reports')
    .select()
    .order('created_time', { ascending: false })

  if (p.offset) {
    q.range(p.offset, p.limit + p.offset)
  } else {
    q.limit(p.limit)
  }

  if (p.after?.createdTime) {
    q.lt('created_time', millisToTs(p.after.createdTime))
  }

  const { data } = await run(q)
  return await convertReports(data)
}

// adapted from api/v0/reports

type LiteReport = {
  slug: string
  id: string
  text: string | JSONContent
  owner: DisplayUser
  reporter: DisplayUser
  reasonsDescription: string | null
  contentId: string
  contentType: string
  createdTime?: number
}

const convertReports = async (
  rows: Row<'reports'>[]
): Promise<LiteReport[]> => {
  return filterDefined(
    await Promise.all(
      rows.map(async (report) => {
        const {
          content_id: contentId,
          content_type: contentType,
          content_owner_id: contentOwnerId,
          parent_type: parentType,
          parent_id: parentId,
          user_id: userId,
          created_time: createdTime,
          id,
          description,
        } = report

        let partialReport: { slug: string; text: JSONContent | string } | null =
          null
        // Reported contract
        if (contentType === 'contract') {
          const contract = await api('market/:id', {
            id: contentId,
            lite: true,
          })
          partialReport = contract
            ? {
                slug: contractPath(contract),
                text: contract.question,
              }
            : null
          // Reported comment on a contract
        } else if (
          contentType === 'comment' &&
          parentType === 'contract' &&
          parentId
        ) {
          const contract = await api('market/:id', { id: parentId, lite: true })
          if (contract) {
            const comment = await getComment(contentId)
            partialReport = comment && {
              slug: contractPath(contract) + '#' + comment.id,
              text: comment.content,
            }
          }
        } else if (contentType === 'user') {
          const reportedUser = await getUserById(contentId)
          partialReport = {
            slug: `/${reportedUser?.username}`,
            text: reportedUser?.name ?? '',
          }
        }

        const owner = await getUserById(contentOwnerId)
        const reporter = await getUserById(userId)

        return partialReport && owner
          ? {
              ...partialReport,
              reasonsDescription: description,
              owner,
              reporter,
              contentType,
              contentId,
              id,
              createdTime: tsToMillis(createdTime as any),
            }
          : null
      })
    )
  )
}
