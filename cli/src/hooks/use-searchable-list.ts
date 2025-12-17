import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'

interface SearchableItem {
  id: string
  label: string
}

export interface UseSearchableListOptions<T extends SearchableItem> {
  /** Items to filter */
  items: T[]
  /** Key that triggers reset of search and focus (e.g., currentPath) */
  resetKey?: string
  /** Custom filter function (defaults to case-insensitive label matching) */
  filterFn?: (item: T, query: string) => boolean
}

export interface UseSearchableListReturn<T extends SearchableItem> {
  /** Current search query */
  searchQuery: string
  /** Set the search query */
  setSearchQuery: (query: string) => void
  /** Currently focused item index */
  focusedIndex: number
  /** Set the focused index */
  setFocusedIndex: Dispatch<SetStateAction<number>>
  /** Filtered items based on search query */
  filteredItems: T[]
  /** Handle focus change from hover */
  handleFocusChange: (index: number) => void
}

/**
 * Hook for managing searchable list state.
 * Handles search filtering, focus management, and automatic index clamping.
 */
export function useSearchableList<T extends SearchableItem>({
  items,
  resetKey,
  filterFn,
}: UseSearchableListOptions<T>): UseSearchableListReturn<T> {
  const [searchQuery, setSearchQuery] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(0)

  // Default filter function: case-insensitive label matching
  const defaultFilterFn = useCallback(
    (item: T, query: string) =>
      item.label.toLowerCase().includes(query.toLowerCase()),
    [],
  )

  const filterFunction = filterFn ?? defaultFilterFn

  // Filter items based on search query
  // Skip filtering for path-like queries (starting with / or ~) - those are for navigation, not filtering
  const filteredItems = useMemo(() => {
    const trimmedQuery = searchQuery.trim()
    if (!trimmedQuery) return items
    // Path-like queries should not filter the directory list
    if (trimmedQuery.startsWith('/') || trimmedQuery.startsWith('~')) return items
    // Always keep parent directory entry (..) visible, filter others
    return items.filter((item) => 
      item.label === '..' || filterFunction(item, trimmedQuery)
    )
  }, [items, searchQuery, filterFunction])

  // Reset focus when resetKey changes (but keep search query)
  useEffect(() => {
    setFocusedIndex(0)
  }, [resetKey])

  // Clamp focused index when filtered list changes
  useEffect(() => {
    if (focusedIndex >= filteredItems.length) {
      setFocusedIndex(Math.max(0, filteredItems.length - 1))
    }
  }, [filteredItems.length, focusedIndex])

  // Handle focus change from hover
  const handleFocusChange = useCallback((index: number) => {
    setFocusedIndex(index)
  }, [])

  return {
    searchQuery,
    setSearchQuery,
    focusedIndex,
    setFocusedIndex,
    filteredItems,
    handleFocusChange,
  }
}
