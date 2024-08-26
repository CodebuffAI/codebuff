import { Group } from 'common/group'
import {
  ArrowLeftIcon,
  BookmarkIcon,
  PlusCircleIcon,
} from '@heroicons/react/outline'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { Button } from 'web/components/buttons/button'
import { AddContractToGroupModal } from 'web/components/topics/add-contract-to-group-modal'
import {
  internalFollowTopic,
  internalUnfollowTopic,
} from 'web/components/topics/topics-button'
import { TopicOptions } from 'web/components/topics/topic-options'
import { Row } from 'web/components/layout/row'
import { useIsFollowingTopic } from 'web/hooks/use-group-supabase'
import { User } from 'common/user'
import { forwardRef, Ref, useState } from 'react'
import { TopicDropdown } from 'web/components/topics/topic-dropdown'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { TOPIC_IDS_YOU_CANT_FOLLOW } from 'common/supabase/groups'
import { toast } from 'react-hot-toast'
import { getTopicShareUrl } from 'common/util/share'
import { useRouter } from 'next/router'

export const QuestionsTopicTitle = forwardRef(
  (
    props: {
      currentTopic: Group | undefined
      topicSlug: string | undefined
      user: User | null | undefined
      setTopicSlug: (topicSlug: string) => void
    },
    ref: Ref<HTMLDivElement>
  ) => {
    const { currentTopic, setTopicSlug, user } = props
    const { isFollowing, setIsFollowing } = useIsFollowingTopic(
      currentTopic?.slug
    )
    const [showAddContract, setShowAddContract] = useState(false)
    const [loading, setLoading] = useState(false)
    const isMobile = useIsMobile()
    const router = useRouter()
    if (currentTopic) {
      return (
        <Row
          className={
            'col-span-8 h-11 justify-between gap-1 sm:mb-1 xl:col-span-7'
          }
          ref={ref}
        >
          <Row className={'gap-1 truncate'}>
            <button
              onClick={router.back}
              className="text-ink-600 hover:bg-ink-200 disabled:text-ink-300 font-md text-center' my-auto inline-flex items-center justify-center rounded-md p-2 ring-inset transition-colors disabled:cursor-not-allowed disabled:bg-transparent"
            >
              <ArrowLeftIcon className="h-5 w-5" aria-hidden />
              <div className="sr-only">Back</div>
            </button>
            <span
              className="text-primary-700 self-center truncate text-2xl"
              onClick={() =>
                currentTopic ? toast(`Questions in ${currentTopic.name}`) : null
              }
            >
              {currentTopic?.name ?? 'Browse'}
            </span>
          </Row>
          <Row>
            <CopyLinkOrShareButton
              url={getTopicShareUrl(currentTopic?.slug ?? '', user?.username)}
              className={'gap-1 whitespace-nowrap'}
              eventTrackingName={'copy questions page link'}
              size={isMobile ? 'sm' : 'md'}
            >
              Share
            </CopyLinkOrShareButton>
            {isFollowing && !isMobile && user ? (
              <>
                <Button
                  color={'gray-white'}
                  size={isMobile ? 'sm' : 'md'}
                  className={'whitespace-nowrap'}
                  onClick={() => setShowAddContract(true)}
                >
                  <Row>
                    <PlusCircleIcon className={'mr-1 h-5 w-5'} />
                    Add questions
                  </Row>
                </Button>
                {showAddContract && user && (
                  <AddContractToGroupModal
                    group={currentTopic}
                    open={showAddContract}
                    setOpen={setShowAddContract}
                    user={user}
                  />
                )}
              </>
            ) : (
              !isFollowing &&
              !TOPIC_IDS_YOU_CANT_FOLLOW.includes(currentTopic.id) &&
              user && (
                <Button
                  color={'gray-white'}
                  className={'whitespace-nowrap'}
                  loading={loading}
                  size={isMobile ? 'sm' : 'md'}
                  onClick={() => {
                    setLoading(true)
                    internalFollowTopic(user, currentTopic)
                      .then(() => {
                        setIsFollowing(true)
                      })
                      .finally(() => {
                        setLoading(false)
                      })
                  }}
                >
                  {!loading && <BookmarkIcon className={'mr-1 h-5 w-5'} />}
                  Follow
                </Button>
              )
            )}

            {currentTopic ? (
              <TopicOptions
                group={currentTopic}
                isMember={!!isFollowing}
                unfollow={() => {
                  setIsFollowing(false)
                  internalUnfollowTopic(user, currentTopic).catch(() =>
                    // undo optimistic update
                    setIsFollowing(true)
                  )
                }}
                user={user}
                className={'flex [&_*]:flex [&_button]:pr-2'}
              />
            ) : user ? (
              <TopicDropdown
                setCurrentTopic={setTopicSlug}
                user={user}
                className={'self-center md:hidden'}
              />
            ) : null}
          </Row>
        </Row>
      )
    }

    return <></>
  }
)
