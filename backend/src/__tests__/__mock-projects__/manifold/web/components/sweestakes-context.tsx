import React, { createContext, useContext } from 'react'
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'

type SweepstakesContextType = {
  isPlay: boolean
  setIsPlay: (isPlay: boolean) => void
}

const SweepstakesContext = createContext<SweepstakesContextType | undefined>(
  undefined
)

export const SweepstakesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [queryPlay, setQueryPlay] = usePersistentQueryState('play', 'true')

  const isPlay = !queryPlay || queryPlay === 'true'
  const setIsPlay = (isPlay: boolean) => {
    setQueryPlay(isPlay ? 'true' : 'false')
  }

  return (
    <SweepstakesContext.Provider value={{ isPlay, setIsPlay }}>
      {children}
    </SweepstakesContext.Provider>
  )
}

export const useSweepstakes = () => {
  const context = useContext(SweepstakesContext)
  if (context === undefined) {
    throw new Error('useSweepstakes must be used within a SweepstakesProvider')
  }
  return context
}
