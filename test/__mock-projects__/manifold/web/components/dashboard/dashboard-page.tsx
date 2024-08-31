import {
  convertDashboardSqltoTS,
  Dashboard,
  DashboardItem,
  MAX_DASHBOARD_TITLE_LENGTH,
} from 'common/dashboard'
import { LinkPreviews } from 'common/link-preview'
import { useUser } from 'web/hooks/use-user'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useDashboardFromSlug } from 'web/hooks/use-dashboard'
import { useEffect, useState } from 'react'
import { ENV_CONFIG, isAdminId, isModId } from 'common/envs/constants'
import { useWarnUnsavedChanges } from 'web/hooks/use-warn-unsaved-changes'
import { SEO } from 'web/components/SEO'
import Head from 'next/head'
import { Col } from 'web/components/layout/col'
import { InputWithLimit } from 'web/components/dashboard/input-with-limit'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { referralQuery } from 'common/util/share'
import { FollowDashboardButton } from 'web/components/dashboard/follow-dashboard-button'
import { Button } from 'web/components/buttons/button'
import { deleteDashboard, updateDashboard } from 'web/lib/api/api'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { AddItemCard } from 'web/components/dashboard/add-dashboard-item'
import { DashboardContent } from 'web/components/dashboard/dashboard-content'
import { usePathname, useRouter } from 'next/navigation'
import { HeadlineTabs } from 'web/components/dashboard/header'
import { Headline } from 'common/news'
import { type Contract } from 'common/contract'
import { UserHovercard } from '../user/user-hovercard'
import clsx from 'clsx'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'

export type DashboardEndpoints = 'news' | 'politics' | 'ai'

export function DashboardPage(props: {
  initialDashboard: Dashboard
  previews: LinkPreviews
  initialContracts: Contract[]
  headlines: Headline[]
  slug: string
  editByDefault: boolean
  embeddedInParent?: boolean
  endpoint: DashboardEndpoints
  className?: string
}) {
  const user = useUser()
  useSaveReferral(user)
  useSaveCampaign()

  const router = useRouter()
  const pathName = usePathname() ?? ''

  const {
    initialDashboard,
    slug,
    editByDefault,
    previews,
    initialContracts,
    headlines,
    embeddedInParent,
    endpoint,
    className,
  } = props
  const fetchedDashboard = useDashboardFromSlug(slug)
  const [dashboard, setDashboard] = useState<Dashboard>(initialDashboard)

  const isValid =
    dashboard.title.length > 0 &&
    dashboard.title.length <= MAX_DASHBOARD_TITLE_LENGTH

  // Update the dashboard state if a new fetchedDashboard becomes available
  useEffect(() => {
    if (fetchedDashboard) {
      setDashboard(fetchedDashboard)
    }
  }, [fetchedDashboard])

  const updateItems = (newItems: DashboardItem[]) =>
    setDashboard({ ...dashboard, items: newItems })

  const updateTitle = (newTitle: string) =>
    setDashboard({ ...dashboard, title: newTitle })

  const updateTopics = (newTopics: string[]) =>
    setDashboard({ ...dashboard, topics: newTopics })

  const isCreator = dashboard.creatorId === user?.id
  const isOnlyMod =
    !isCreator && user && (isAdminId(user.id) || isModId(user.id))

  const [editMode, setEditMode] = useState(editByDefault)
  useWarnUnsavedChanges(editMode)

  return (
    <>
      {!embeddedInParent && (
        <>
          <SEO
            title={dashboard.title}
            description={`dashboard created by ${dashboard.creatorName}`}
          />
          {!editMode && (
            <HeadlineTabs
              className="mb-3"
              headlines={headlines}
              currentSlug={slug}
              endpoint={endpoint}
            />
          )}

          {dashboard.visibility === 'deleted' && (
            <>
              <Head>
                <meta name="robots" content="noindex, nofollow" />
              </Head>
              <div className="bg-error w-full rounded p-6 text-center text-lg text-white">
                Deleted by mods
              </div>
            </>
          )}
        </>
      )}

      <Col className={clsx('w-full px-1 sm:px-2', className)}>
        <div className="my-2 sm:mt-4 lg:mt-0">
          {editMode ? (
            <InputWithLimit
              placeholder={'Dashboard Title'}
              text={dashboard.title}
              setText={updateTitle}
              limit={MAX_DASHBOARD_TITLE_LENGTH}
              className="!w-full !text-lg"
            />
          ) : (
            <Row className="items-center justify-between">
              <Title className="!mb-0 ">{dashboard.title}</Title>

              <div className="flex items-center">
                <CopyLinkOrShareButton
                  url={`https://${ENV_CONFIG.domain}/${endpoint}/${slug}${
                    user?.username ? referralQuery(user.username) : ''
                  }`}
                  eventTrackingName="copy dashboard link"
                  tooltip="Share"
                />

                <FollowDashboardButton
                  dashboardId={dashboard.id}
                  dashboardCreatorId={dashboard.creatorId}
                  ttPlacement="bottom"
                />
                {isCreator && (
                  <Button onClick={() => setEditMode(true)}>Edit</Button>
                )}
                {isOnlyMod && (
                  <Button
                    color="red"
                    className="ml-6"
                    onClick={() => setEditMode(true)}
                  >
                    Edit as Mod
                  </Button>
                )}
              </div>
            </Row>
          )}
        </div>
        {editMode ? (
          <Row className="bg-canvas-50 sticky top-0 z-20 mb-2 w-full items-center justify-end gap-2 self-start py-1">
            {isOnlyMod && (
              <Button
                color="red"
                className="mr-auto"
                onClick={() => {
                  deleteDashboard({ dashboardId: dashboard.id })
                  setEditMode(false)
                  router.replace(pathName.split('?')[0])
                }}
              >
                Delete (mark as spam)
              </Button>
            )}
            <Button
              color="gray"
              onClick={() => {
                // reset to original state
                setDashboard(fetchedDashboard || initialDashboard)
                setEditMode(false)
                router.replace(pathName.split('?')[0])
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!isValid}
              onClick={() => {
                updateDashboard({
                  dashboardId: dashboard.id,
                  title: dashboard.title,
                  items: dashboard.items,
                  topics: dashboard.topics,
                }).then((data) => {
                  if (data?.updateDashboard) {
                    setDashboard(
                      convertDashboardSqltoTS(data.updateDashboard) as any
                    )
                  }
                })
                setEditMode(false)
                router.replace(pathName.split('?')[0])
              }}
            >
              Save
            </Button>
          </Row>
        ) : (
          <UserHovercard userId={dashboard.creatorId} className="mb-8">
            <Row className="items-center gap-2">
              <Avatar
                username={dashboard.creatorUsername}
                avatarUrl={dashboard.creatorAvatarUrl}
                size="xs"
              />
              <UserLink
                user={{
                  id: dashboard.creatorId,
                  name: dashboard.creatorName,
                  username: dashboard.creatorUsername,
                }}
                className="text-ink-700"
              />
            </Row>
          </UserHovercard>
        )}
        {editMode && (
          <div className="mb-4">
            <AddItemCard
              items={dashboard.items}
              setItems={updateItems}
              topics={dashboard.topics}
              setTopics={updateTopics}
            />
          </div>
        )}
        <DashboardContent
          key={dashboard.id} // make sure content re-renders when switching pages
          previews={previews}
          initialContracts={initialContracts}
          items={dashboard.items}
          setItems={updateItems}
          topics={dashboard.topics}
          setTopics={updateTopics}
          isEditing={editMode}
          hideTopicLinks={embeddedInParent}
        />
      </Col>
    </>
  )
}
