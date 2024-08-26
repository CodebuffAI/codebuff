import clsx from 'clsx'
import Link from 'next/link'

import { Row } from 'web/components/layout/row'
import { Contract, contractPath } from 'common/contract'
import { Avatar } from 'web/components/widgets/avatar'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { UserHovercard } from './user/user-hovercard'

export function SimpleContractRow(props: {
  contract: Contract
  className?: string
}) {
  const { contract, className } = props

  return (
    <Link
      href={contractPath(contract)}
      className={clsx(
        'group flex flex-col gap-1 whitespace-nowrap px-4 py-3 lg:flex-row lg:gap-2',
        'focus:bg-ink-300/30 lg:hover:bg-ink-300/30 transition-colors',
        className
      )}
    >
      <UserHovercard userId={contract.creatorId}>
        <Avatar
          className="hidden lg:mr-1 lg:flex"
          username={contract.creatorUsername}
          avatarUrl={contract.creatorAvatarUrl}
          size="xs"
        />
      </UserHovercard>
      <div
        className={clsx(
          'break-anywhere mr-0.5 whitespace-normal font-medium lg:mr-auto'
        )}
      >
        {contract.question}
      </div>
      <Row className="gap-3">
        <UserHovercard userId={contract.creatorId}>
          <Avatar
            className="lg:hidden"
            username={contract.creatorUsername}
            avatarUrl={contract.creatorAvatarUrl}
            size="xs"
          />
        </UserHovercard>
        <div className="min-w-[2rem] text-right font-semibold">
          <ContractStatusLabel contract={contract} />
        </div>
      </Row>
    </Link>
  )
}
