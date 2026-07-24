import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  DEFAULT_DAY_OF_LEAGUE,
  MAX_DAY_OF_LEAGUE,
  MIN_DAY_OF_LEAGUE,
} from '../lib/marketData'

interface CurrentDayContextValue {
  currentDayOfLeague: number
  setCurrentDayOfLeague: (dayOfLeague: number) => void
  minDayOfLeague: number
  maxDayOfLeague: number
}

const CurrentDayContext = createContext<CurrentDayContextValue | null>(null)

export function CurrentDayProvider({ children }: { children: ReactNode }) {
  const [currentDayOfLeague, setCurrentDayOfLeague] = useState(() =>
    Math.min(
      Math.max(DEFAULT_DAY_OF_LEAGUE, MIN_DAY_OF_LEAGUE),
      MAX_DAY_OF_LEAGUE,
    ),
  )

  const value = useMemo<CurrentDayContextValue>(
    () => ({
      currentDayOfLeague,
      setCurrentDayOfLeague,
      minDayOfLeague: MIN_DAY_OF_LEAGUE,
      maxDayOfLeague: MAX_DAY_OF_LEAGUE,
    }),
    [currentDayOfLeague],
  )

  return (
    <CurrentDayContext.Provider value={value}>
      {children}
    </CurrentDayContext.Provider>
  )
}

export function useCurrentDay(): CurrentDayContextValue {
  const context = useContext(CurrentDayContext)
  if (!context) {
    throw new Error('useCurrentDay must be used within a CurrentDayProvider')
  }
  return context
}
