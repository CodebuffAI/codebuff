import { FaBookmark, FaRegBookmark } from 'react-icons/fa6'
import { useUserFollowsDashboard } from 'web/hooks/use-dashboard-follows'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { followDashboard } from 'web/lib/api/api'
import { Tooltip } from '../widgets/tooltip'
import { Button } from '../buttons/button'

export function FollowDashboardButton(props: {
  dashboardId: string
  dashboardCreatorId: string
  ttPlacement: 'left' | 'bottom'
}) {
  const { dashboardId, dashboardCreatorId, ttPlacement } = props
  const user = useUser()
  const { isFollowing, setIsFollowing } = useUserFollowsDashboard(
    user?.id,
    dashboardId
  )
  const isAuth = useIsAuthorized()
  if (!user || !isAuth || dashboardCreatorId === user?.id) {
    return null
  }
  return (
    <Tooltip text={'Bookmark'} placement={ttPlacement}>
      <Button
        onClick={(e) => {
          e.preventDefault()
          followDashboard({ dashboardId: dashboardId }).then((result) => {
            setIsFollowing(result.isFollowing)
          })
        }}
        color={'gray-white'}
      >
        {isFollowing ? (
          <FaBookmark className={'h-5 w-5 text-yellow-500'} />
        ) : (
          <FaRegBookmark className={' h-5 w-5'} />
        )}
      </Button>
    </Tooltip>
  )
}
