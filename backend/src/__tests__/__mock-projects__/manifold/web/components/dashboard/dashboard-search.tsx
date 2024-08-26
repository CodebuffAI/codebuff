import clsx from 'clsx'
import { Dashboard } from 'common/dashboard'
import { debounce, isEqual } from 'lodash'
import { useCallback, useEffect, useRef } from 'react'
import {
  useYourDashboards,
  useYourFollowedDashboards,
} from 'web/hooks/use-dashboard'
import { useEvent } from 'web/hooks/use-event'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'
import {
  historyStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { supabaseSearchDashboards } from 'web/lib/api/api'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Input } from '../widgets/input'
import { DashboardCards } from './dashboard-cards'
const DASHBOARDS_PER_PAGE = 50

const INITIAL_STATE = {
  dashboards: undefined,
  shouldLoadMore: true,
}

export type DashboardSearchState = {
  dashboards: Dashboard[] | undefined
  shouldLoadMore: boolean
}

export function DashboardSearch() {
  const yourDashboards = useYourDashboards()
  const yourFollowedDashboards = useYourFollowedDashboards()

  const performQuery = useEvent(
    async (currentState, freshQuery?: boolean) =>
      (await debouncedQuery(currentState, freshQuery)) ?? false
  )
  const [state, setState] = usePersistentInMemoryState<DashboardSearchState>(
    INITIAL_STATE,
    `dashboard-search`
  )

  const loadMoreDashboards = () => performQuery(state)

  const searchTerm = useRef<string>('')
  const [inputTerm, setInputTerm] = usePersistentQueryState('search', '')

  const isEmpty = searchTerm.current.length === 0

  const requestId = useRef(0)
  const debouncedQuery = useCallback(
    debounce(
      async (currentState, freshQuery?: boolean) =>
        query(currentState, freshQuery),
      200
    ),
    []
  )

  const query = async (
    currentState: DashboardSearchState,
    freshQuery?: boolean
  ) => {
    const id = ++requestId.current
    const offset = freshQuery
      ? 0
      : currentState.dashboards
      ? currentState.dashboards.length
      : 0

    if (freshQuery || currentState.shouldLoadMore) {
      const results = await supabaseSearchDashboards({
        term: searchTerm.current,
        offset: offset,
        limit: DASHBOARDS_PER_PAGE,
      })

      if (id === requestId.current) {
        const newDashboards: Dashboard[] = results as Dashboard[]
        const freshDashboards = freshQuery
          ? newDashboards
          : [
              ...(currentState.dashboards ? currentState.dashboards : []),
              ...newDashboards,
            ]

        const shouldLoadMore = newDashboards.length === DASHBOARDS_PER_PAGE

        setState({
          dashboards: freshDashboards,
          shouldLoadMore,
        })
        if (freshQuery) window.scrollTo(0, 0)

        return shouldLoadMore
      }
    }
    return false
  }

  // Always do first query when loading search page, unless going back in history.
  const [firstQuery, setFirstQuery] = usePersistentState(true, {
    key: `dashboard-supabase-first-query`,
    store: historyStore(),
  })

  const onSearchTermChanged = useRef(
    debounce((term) => {
      if (!isEqual(searchTerm.current, term) || firstQuery) {
        setFirstQuery(false)
        searchTerm.current = term
        performQuery(INITIAL_STATE, true)
      }
    }, 100)
  ).current

  useEffect(() => {
    onSearchTermChanged(inputTerm)
  }, [inputTerm])

  const dashboards = isEmpty
    ? state.dashboards?.filter((d) => {
        return !(
          yourDashboards?.some((yd) => d.id === yd.id) ||
          yourFollowedDashboards?.some((yfd) => d.id === yfd.id)
        )
      })
    : state.dashboards
  return (
    <Col className="gap-2">
      <Input
        type="text"
        inputMode="search"
        value={inputTerm}
        onChange={(e) => setInputTerm(e.target.value)}
        placeholder="Search dashboards"
        className="w-full"
      />
      {isEmpty && (
        <>
          <DashboardSection
            dashboards={yourDashboards}
            header="YOUR DASHBOARDS"
          />
          <DashboardSection
            dashboards={yourFollowedDashboards}
            header="BOOKMARKED"
          />
          <Header header="MORE" className="-mb-1 mt-1" />
        </>
      )}
      <DashboardCards dashboards={dashboards} loadMore={loadMoreDashboards} />
    </Col>
  )
}

function DashboardSection(props: {
  dashboards: Dashboard[] | undefined
  header: string
}) {
  const { dashboards, header } = props
  if (!dashboards || dashboards.length < 1) return null
  return (
    <Col className="mt-1 gap-1">
      <Header header={header} />
      <DashboardCards dashboards={dashboards} />
    </Col>
  )
}

function Header(props: { header: string; className?: string }) {
  const { header, className } = props
  return (
    <Row
      className={clsx(
        'text-ink-400 w-full items-center gap-1 text-xs font-semibold',
        className
      )}
    >
      <hr className="border-ink-300 grow" />
      {header}
      <hr className="border-ink-300 grow" />
    </Row>
  )
}
