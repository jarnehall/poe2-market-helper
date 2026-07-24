import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  DEFAULT_DAYS_BACK,
  DEFAULT_DAYS_FORWARD,
  MIN_WINDOW_DAYS,
} from '../lib/marketData'
import { getStoredNumber, setStoredNumber } from '../lib/storage'
import { useCurrentDay } from './CurrentDayContext'

interface TrendWindowContextValue {
  daysBack: number
  daysForward: number
  setDaysBack: (days: number) => void
  setDaysForward: (days: number) => void
  minDays: number
  maxDaysBack: number
  maxDaysForward: number
}

const TrendWindowContext = createContext<TrendWindowContextValue | null>(null)

export function TrendWindowProvider({ children }: { children: ReactNode }) {
  const { currentDayOfLeague, minDayOfLeague, maxDayOfLeague } =
    useCurrentDay()
  const [daysBack, setDaysBack] = useState(() =>
    getStoredNumber('daysBack', DEFAULT_DAYS_BACK),
  )
  const [daysForward, setDaysForward] = useState(() =>
    getStoredNumber('daysForward', DEFAULT_DAYS_FORWARD),
  )

  useEffect(() => setStoredNumber('daysBack', daysBack), [daysBack])
  useEffect(() => setStoredNumber('daysForward', daysForward), [daysForward])

  // Days back/forward can never reach further than the day-of-league range
  // we have data for, so the sliders' max shrinks as currentDayOfLeague
  // nears either edge of that range.
  const maxDaysBack = currentDayOfLeague - minDayOfLeague
  const maxDaysForward = maxDayOfLeague - currentDayOfLeague

  const value = useMemo<TrendWindowContextValue>(
    () => ({
      daysBack: Math.min(daysBack, maxDaysBack),
      daysForward: Math.min(daysForward, maxDaysForward),
      setDaysBack,
      setDaysForward,
      minDays: MIN_WINDOW_DAYS,
      maxDaysBack,
      maxDaysForward,
    }),
    [daysBack, daysForward, maxDaysBack, maxDaysForward],
  )

  return (
    <TrendWindowContext.Provider value={value}>
      {children}
    </TrendWindowContext.Provider>
  )
}

export function useTrendWindow(): TrendWindowContextValue {
  const context = useContext(TrendWindowContext)
  if (!context) {
    throw new Error(
      'useTrendWindow must be used within a TrendWindowProvider',
    )
  }
  return context
}
