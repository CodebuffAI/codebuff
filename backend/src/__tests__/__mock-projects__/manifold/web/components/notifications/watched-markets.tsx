import { memo, useEffect, useState } from 'react'
import { User } from 'common/user'
import { TextButton } from 'web/components/buttons/text-button'
import { withTracking } from 'web/lib/service/analytics'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import {
  getWatchedContracts,
  getWatchedContractsCount,
} from 'web/lib/supabase/contracts'
import { unfollowMarket } from 'web/components/buttons/follow-market-button'
import { ContractsTable } from '../contract/contracts-table'
import {
  probColumn,
  traderColumn,
} from '../contract/contract-table-col-formats'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Button } from '../buttons/button'

export const UserWatchedContractsButton = memo(
  function UserLikedContractsButton(props: { user: User; className?: string }) {
    const { user, className } = props
    const [isOpen, setIsOpen] = useState(false)

    const [watchedContracts, setWatchedContracts] = useState<
      Awaited<ReturnType<typeof getWatchedContracts>> | undefined
    >(undefined)
    const [watchedContractsCount, setWatchedContractsCount] = useState(0)
    const [query, setQuery] = useState('')
    useEffect(() => {
      getWatchedContractsCount(user.id).then(setWatchedContractsCount)
    }, [user.id])

    useEffect(() => {
      if (!isOpen || watchedContracts !== undefined) return
      getWatchedContracts(user.id).then(setWatchedContracts)
    }, [watchedContracts, isOpen, user.id])

    // filter by query
    const filteredWatchedContracts = watchedContracts?.filter((c) => {
      return (
        query === '' || c.question?.toLowerCase().includes(query.toLowerCase())
      )
    })

    return (
      <>
        <TextButton
          onClick={withTracking(
            () => setIsOpen(true),
            'click user watched markets button'
          )}
          className={className}
        >
          <span className="font-semibold">
            {watchedContractsCount > 0 ? watchedContractsCount : ''}
          </span>{' '}
          Watched Questions
        </TextButton>
        <Modal open={isOpen} setOpen={setIsOpen} size={'lg'}>
          <Col className="bg-canvas-0 rounded p-6">
            <Row className={'mb-4 ml-2 items-center justify-between gap-4 '}>
              <span className={'text-xl'}>Watched questions</span>
              <Input
                placeholder="Search questions"
                className={' w-42'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </Row>
            <Col className={'gap-4'}>
              {!filteredWatchedContracts && <LoadingIndicator />}
              <ContractsTable
                contracts={filteredWatchedContracts ?? ([] as any)}
                columns={[
                  traderColumn,
                  probColumn,
                  {
                    header: 'Unwatch',
                    content: (contract) => (
                      <Button
                        size="2xs"
                        color="gray-outline"
                        onClick={async (e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          await unfollowMarket(contract.id, contract.slug)
                          setWatchedContracts(
                            filteredWatchedContracts?.filter(
                              (c) => c.id !== contract.id
                            )
                          )
                          setWatchedContractsCount(watchedContractsCount - 1)
                        }}
                      >
                        Unwatch
                      </Button>
                    ),
                    width: 'w-16',
                  },
                ]}
              />
            </Col>
          </Col>
        </Modal>
      </>
    )
  }
)
