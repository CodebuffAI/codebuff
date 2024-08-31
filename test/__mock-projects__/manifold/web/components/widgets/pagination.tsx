import clsx from 'clsx'
import { Spacer } from '../layout/spacer'
import { Row } from '../layout/row'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/solid'
import { useEffect } from 'react'
import { range } from 'lodash'
import { usePathname, useRouter } from 'next/navigation'
import { useDefinedSearchParams } from 'web/hooks/use-defined-search-params'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { buttonClass } from 'web/components/buttons/button'
export const PAGE_ELLIPSES = '...'

export function PaginationNextPrev(props: {
  className?: string
  isStart: boolean
  isEnd: boolean
  isLoading: boolean
  isComplete: boolean
  getPrev: () => void
  getNext: () => void
}) {
  const { className, isStart, isEnd, isLoading, isComplete, getPrev, getNext } =
    props
  return (
    <Row
      aria-label="Pagination"
      className={clsx(className, 'flex-1 justify-between gap-2 sm:justify-end')}
    >
      <button
        className={buttonClass('lg', 'gray-outline')}
        onClick={getPrev}
        disabled={isStart}
      >
        Previous
      </button>
      <button
        className={buttonClass('lg', 'gray-outline')}
        onClick={getNext}
        disabled={isEnd && (isLoading || isComplete)}
      >
        {isEnd && isLoading ? <LoadingIndicator size="sm" /> : 'Next'}
      </button>
    </Row>
  )
}

export function Pagination(props: {
  page: number
  pageSize: number
  totalItems: number
  setPage: (page: number) => void
  className?: string
  savePageToQuery?: boolean
}) {
  const { page, pageSize, totalItems, setPage, className, savePageToQuery } =
    props
  const router = useRouter()
  const { searchParams, createQueryString } = useDefinedSearchParams()
  const pathname = usePathname()

  useEffect(() => {
    if (!savePageToQuery) return
    const p = searchParams.get('p')
    if (p && page !== parseInt(p as string)) {
      setPage(parseInt(p as string))
    } else if (!p && page !== 0) {
      setPage(0)
    }
  }, [searchParams])

  const onClick = (page: number) => {
    if (savePageToQuery) {
      router.push(pathname + '?' + createQueryString('p', page.toString()))
    } else setPage(page)
  }

  const maxPage = Math.ceil(totalItems / pageSize) - 1

  if (maxPage <= 0) return <Spacer h={4} />

  const pageNumbers = getPageNumbers(maxPage, page)
  return (
    <nav
      className={clsx(
        'flex w-full items-center bg-inherit pb-4 pt-2',
        className
      )}
      aria-label="Pagination"
    >
      <Row className="mx-auto gap-4">
        <PaginationArrow
          onClick={() => onClick(page - 1)}
          disabled={page <= 0}
          nextOrPrev="prev"
        />
        <Row className="gap-2">
          {pageNumbers.map((pageNumber, index) => (
            <PageNumbers
              key={
                pageNumber === PAGE_ELLIPSES
                  ? `${pageNumber}-${index}`
                  : pageNumber
              }
              pageNumber={pageNumber}
              setPage={onClick}
              page={page}
            />
          ))}
        </Row>
        <PaginationArrow
          onClick={() => onClick(page + 1)}
          disabled={page >= maxPage}
          nextOrPrev="next"
        />
      </Row>
    </nav>
  )
}

export function PaginationArrow(props: {
  onClick: () => void
  disabled: boolean
  nextOrPrev: 'next' | 'prev'
}) {
  const { onClick, disabled, nextOrPrev } = props
  return (
    <div
      onClick={onClick}
      className={clsx(
        'select-none rounded-lg transition-colors',
        disabled
          ? 'text-ink-200 pointer-events-none'
          : 'hover:bg-ink-100 text-primary-700 cursor-pointer'
      )}
    >
      {nextOrPrev === 'prev' && (
        <ChevronLeftIcon className="h-[24px] w-[24px]" />
      )}
      {nextOrPrev === 'next' && (
        <ChevronRightIcon className="h-[24px] w-[24px]" />
      )}
    </div>
  )
}

export function PageNumbers(props: {
  pageNumber: PageNumbers
  setPage: (page: number) => void
  page: number
}) {
  const { pageNumber, setPage, page } = props
  if (pageNumber === PAGE_ELLIPSES || typeof pageNumber === 'string') {
    return <div className="text-ink-400 select-none">{PAGE_ELLIPSES}</div>
  }
  return (
    <button
      onClick={() => setPage(pageNumber)}
      className={clsx(
        'select-none rounded-lg px-2',
        page === pageNumber
          ? 'bg-primary-100 text-primary-700'
          : 'text-ink-400 hover:bg-ink-100'
      )}
    >
      {pageNumber + 1}
    </button>
  )
}

type PageNumbers = number | string

function getPageNumbers(maxPage: number, page: number): Array<PageNumbers> {
  if (maxPage <= 7) {
    return range(0, maxPage + 1)
  }
  if (page < 4) {
    return Array.from<unknown, PageNumbers>(
      { length: 5 },
      (_, index) => index
    ).concat([PAGE_ELLIPSES, maxPage])
  }
  if (page >= maxPage - 3) {
    return [0, PAGE_ELLIPSES].concat(
      Array.from<unknown, PageNumbers>(
        { length: 5 },
        (_, index) => index + maxPage - 4
      )
    )
  }
  return [0, PAGE_ELLIPSES, page - 1, page, page + 1, PAGE_ELLIPSES, maxPage]
}
