import * as React from 'react'

const TABLET_BREAKPOINT = 1024
const MOBILE_BREAKPOINT = 768

export function useResponsiveColumns() {
  const [columns, setColumns] = React.useState(3) // Default to desktop

  React.useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth
      if (width < MOBILE_BREAKPOINT) {
        setColumns(1)
      } else if (width < TABLET_BREAKPOINT) {
        setColumns(2)
      } else {
        setColumns(3)
      }
    }

    // Set initial value
    updateColumns()

    // Listen for resize events
    window.addEventListener('resize', updateColumns)
    return () => window.removeEventListener('resize', updateColumns)
  }, [])

  return columns
}
