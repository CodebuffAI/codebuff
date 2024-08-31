// A data-source unaware pagination mechanism that is appropriate for paging
// lists of unknown length that we can query from the DB.

import { useCallback, useEffect, useReducer } from 'react'

// you can wire up the pagination to a data source that either knows how to
// get the next N items after the first M, or the next N after item X
export type PageSpec<T = unknown> = { limit: number; offset: number; after?: T }
export type DataSource<T> = (page: PageSpec<T>) => PromiseLike<T[]>

interface State<T> {
  // items we were given from outside that are always at the front of the list
  prefix: T[]
  // items we have loaded in the list during the course of events
  items: T[]
  // the index of the requested page. may or may not have loaded items
  page: number
  // whether we are currently loading the next page
  isLoading: boolean
  // whether we believe we have loaded all items
  isComplete: boolean
}

type ActionBase<K, V = void> = V extends void ? { type: K } : { type: K } & V

type Action<T> =
  | ActionBase<'PREFIX', { prefix: T[] }>
  | ActionBase<'LOADING'>
  | ActionBase<'LOADED', { items: T[]; isComplete: boolean }>
  | ActionBase<'MOVE', { page: number }>

function getReducer<T>() {
  return (state: State<T>, action: Action<T>): State<T> => {
    switch (action.type) {
      case 'PREFIX': {
        return { ...state, ...action }
      }
      case 'LOADING': {
        return { ...state, isLoading: true }
      }
      case 'LOADED': {
        return { ...state, isLoading: false, ...action }
      }
      case 'MOVE': {
        return { ...state, page: Math.max(0, action.page) }
      }
      default:
        throw new Error('Invalid action.')
    }
  }
}

export type PaginationOptions<T> = {
  /** The size of a page (for item fetching purposes in particular.) */
  pageSize: number

  /** Drives item fetching. Must load the next `limit` items after an item.
   *
   * If the pagination asks for N items and the data source returns only M < N,
   * the pagination takes that as an indication that the list is complete.
   */
  q: DataSource<T>

  /** Items which will always be present at the start of the list.
   *
   * Should be used when e.g. the first page is preloaded in static props,
   * or when users can add new items to the front of the list using the UI,
   * or when new items are streamed into the client after initial load.
   */
  prefix?: T[]
}

function getInitialState<T>(opts: PaginationOptions<T>): State<T> {
  return {
    prefix: opts.prefix ?? [],
    items: [],
    page: 0,
    isLoading: false,
    isComplete: false,
  }
}

export function usePagination<T>(opts: PaginationOptions<T>) {
  const [state, dispatch] = useReducer(getReducer<T>(), opts, getInitialState)

  const allItems = [...state.prefix, ...state.items]
  const lastItem = allItems[allItems.length - 1]
  const itemCount = allItems.length
  const pagesCount = Math.ceil(itemCount / opts.pageSize)
  const page = Math.min(state.page, Math.max(pagesCount - 1, 0))
  const pageStart = page * opts.pageSize
  const pageEnd = pageStart + opts.pageSize
  const pageItems = allItems.slice(pageStart, pageEnd)

  useEffect(() => {
    dispatch({ type: 'PREFIX', prefix: opts.prefix ?? [] })
  }, [opts.prefix])

  // note: i guess if q changed we would probably want to wipe existing items,
  // and ignore the results of in-progress queries here? unclear with no example

  const itemsRequested = (state.page + 1) * opts.pageSize - itemCount
  const shouldLoad = itemsRequested > 0 && !state.isComplete
  useEffect(() => {
    if (shouldLoad) {
      const offset = state.page * opts.pageSize
      const spec = { limit: itemsRequested, offset, after: lastItem }
      dispatch({ type: 'LOADING' })
      opts.q(spec).then((newItems) => {
        const isComplete = newItems.length < opts.pageSize
        const items = [...state.items, ...newItems]
        dispatch({ type: 'LOADED', items, isComplete })
      })
    }
  }, [shouldLoad, state.page, opts.pageSize, lastItem, opts.q])

  const setPage = useCallback(
    (page: number) => dispatch({ type: 'MOVE', page }),
    [dispatch]
  )

  const getPrev = useCallback(
    () => dispatch({ type: 'MOVE', page: page - 1 }),
    [dispatch, page]
  )

  const getNext = useCallback(
    // allow page past the end -- we'll load the new page
    () => dispatch({ type: 'MOVE', page: page + 1 }),
    [dispatch, page]
  )

  const prepend = useCallback(
    (...items: T[]) =>
      dispatch({ type: 'PREFIX', prefix: [...items, ...state.prefix] }),
    [dispatch, state.prefix]
  )

  return {
    items: pageItems,
    page,
    pageStart,
    pageEnd,
    pageSize: opts.pageSize,
    isLoading: state.isLoading,
    isComplete: state.isComplete,
    isStart: pageStart === 0,
    isEnd: pageEnd >= itemCount,
    setPage,
    getPrev,
    getNext,
    prepend,
  }
}
