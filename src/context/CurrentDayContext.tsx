import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  DEFAULT_DAY_OF_LEAGUE,
  MAX_DAY_OF_LEAGUE,
  MIN_DAY_OF_LEAGUE,
} from '../lib/marketData'

// DEFAULT_DAY_OF_LEAGUE can fall outside [MIN_DAY_OF_LEAGUE, MAX_DAY_OF_LEAGUE]
// (e.g. DEFAULT_CURRENT_DATE landing before a league's startDate), so it's
// always clamped before use — on first mount and again on reset.
function clampedDefaultDayOfLeague(): number {
  return Math.min(
    Math.max(DEFAULT_DAY_OF_LEAGUE, MIN_DAY_OF_LEAGUE),
    MAX_DAY_OF_LEAGUE,
  )
}

interface CurrentDayContextValue {
  currentDayOfLeague: number
  setCurrentDayOfLeague: (dayOfLeague: number) => void
  resetCurrentDay: () => void
  minDayOfLeague: number
  maxDayOfLeague: number
}

const CurrentDayContext = createContext<CurrentDayContextValue | null>(null)

export function CurrentDayProvider({ children }: { children: ReactNode }) {
  const [currentDayOfLeague, setCurrentDayOfLeague] = useState(
    clampedDefaultDayOfLeague,
  )

  const resetCurrentDay = () =>
    setCurrentDayOfLeague(clampedDefaultDayOfLeague())

  const value = useMemo<CurrentDayContextValue>(
    () => ({
      currentDayOfLeague,
      setCurrentDayOfLeague,
      resetCurrentDay,
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
