import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_CURRENT_DATE, getDayOfLeagueForDate } from '../lib/marketData'
import {
  getStoredNumber,
  getStoredStringArray,
  setStoredNumber,
  setStoredStringArray,
} from '../lib/storage'
import { useMeta } from './MetaContext'

export interface FiltersState {
  categories: string[]
  pairCurrencies: string[]
  currentDayOfLeague: number
  daysBack: number
  daysForward: number
  investmentCount: number
  minVolume: number
}

interface FiltersContextValue {
  // Every setter takes effect immediately (persisted to localStorage and
  // sent to the API on the next request) — there's no separate "apply"
  // step. daysBack/daysForward are already clamped to how far
  // currentDayOfLeague is from the day-of-league bounds.
  filters: FiltersState
  maxDaysBack: number
  maxDaysForward: number
  toggleCategory: (category: string) => void
  togglePairCurrency: (pairId: string) => void
  setCurrentDayOfLeague: (day: number) => void
  setDaysBack: (days: number) => void
  setDaysForward: (days: number) => void
  setInvestmentCount: (count: number) => void
  setMinVolume: (volume: number) => void
  resetFilters: () => void
}

const FiltersContext = createContext<FiltersContextValue | null>(null)

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function FiltersProvider({ children }: { children: ReactNode }) {
  const meta = useMeta()
  const { bounds } = meta

  const defaultFilters = (): FiltersState => ({
    categories: meta.categories,
    pairCurrencies: meta.pairCurrencies.map((pairCurrency) => pairCurrency.id),
    currentDayOfLeague: clamp(
      getDayOfLeagueForDate(DEFAULT_CURRENT_DATE, meta.currentLeague.startDate),
      bounds.minDayOfLeague,
      bounds.maxDayOfLeague,
    ),
    daysBack: bounds.defaultDaysBack,
    daysForward: bounds.defaultDaysForward,
    investmentCount: bounds.defaultBestInvestmentCount,
    minVolume: bounds.defaultMinVolume,
  })

  const storedFilters = (): FiltersState => {
    const defaults = defaultFilters()
    return {
      categories: getStoredStringArray('selectedCategories', defaults.categories),
      pairCurrencies: getStoredStringArray('selectedPairCurrencies', defaults.pairCurrencies),
      currentDayOfLeague: clamp(
        getStoredNumber('currentDayOfLeague', defaults.currentDayOfLeague),
        bounds.minDayOfLeague,
        bounds.maxDayOfLeague,
      ),
      daysBack: getStoredNumber('daysBack', defaults.daysBack),
      daysForward: getStoredNumber('daysForward', defaults.daysForward),
      investmentCount: getStoredNumber('investmentCount', defaults.investmentCount),
      minVolume: getStoredNumber('minVolume', defaults.minVolume),
    }
  }

  const [filtersRaw, setFiltersRaw] = useState<FiltersState>(storedFilters)

  // Persisting as its own effect (rather than inline in every setter) keeps
  // each setter a plain state update — this is the one place that actually
  // writes to localStorage, running once per resolved change regardless of
  // how many setters fired to get there.
  useEffect(() => {
    setStoredStringArray('selectedCategories', filtersRaw.categories)
    setStoredStringArray('selectedPairCurrencies', filtersRaw.pairCurrencies)
    setStoredNumber('currentDayOfLeague', filtersRaw.currentDayOfLeague)
    setStoredNumber('daysBack', filtersRaw.daysBack)
    setStoredNumber('daysForward', filtersRaw.daysForward)
    setStoredNumber('investmentCount', filtersRaw.investmentCount)
    setStoredNumber('minVolume', filtersRaw.minVolume)
  }, [filtersRaw])

  // Days back/forward can never reach further than the day-of-league range
  // there's data for, so their effective max shrinks as currentDayOfLeague
  // nears either edge — mirroring the old TrendWindowContext. Also capped at
  // bounds.maxWindowDays regardless of how much data exists, since a window
  // that wide stops being a useful "recent trend" view.
  const maxDaysBack = Math.min(
    filtersRaw.currentDayOfLeague - bounds.minDayOfLeague,
    bounds.maxWindowDays,
  )
  const maxDaysForward = Math.min(
    bounds.maxDayOfLeague - filtersRaw.currentDayOfLeague,
    bounds.maxWindowDays,
  )

  // Memoized on filtersRaw (a stable useState reference, only ever replaced
  // by its own setter) so `filters` keeps a stable identity across
  // unrelated re-renders — otherwise every consumer's effect keyed on
  // `filters` (like the best-investments fetch) would refire spuriously.
  const filters = useMemo<FiltersState>(
    () => ({
      ...filtersRaw,
      daysBack: Math.min(filtersRaw.daysBack, maxDaysBack),
      daysForward: Math.min(filtersRaw.daysForward, maxDaysForward),
    }),
    [filtersRaw, maxDaysBack, maxDaysForward],
  )

  const resetFilters = () => setFiltersRaw(defaultFilters())

  const value = useMemo<FiltersContextValue>(
    () => ({
      filters,
      maxDaysBack,
      maxDaysForward,
      toggleCategory: (category) =>
        setFiltersRaw((current) => ({
          ...current,
          categories: current.categories.includes(category)
            ? current.categories.filter((c) => c !== category)
            : [...current.categories, category],
        })),
      togglePairCurrency: (pairId) =>
        setFiltersRaw((current) => ({
          ...current,
          pairCurrencies: current.pairCurrencies.includes(pairId)
            ? current.pairCurrencies.filter((p) => p !== pairId)
            : [...current.pairCurrencies, pairId],
        })),
      setCurrentDayOfLeague: (day) =>
        setFiltersRaw((current) => ({
          ...current,
          currentDayOfLeague: clamp(day, bounds.minDayOfLeague, bounds.maxDayOfLeague),
        })),
      setDaysBack: (days) =>
        setFiltersRaw((current) => ({ ...current, daysBack: Math.max(bounds.minWindowDays, days) })),
      setDaysForward: (days) =>
        setFiltersRaw((current) => ({ ...current, daysForward: Math.max(bounds.minWindowDays, days) })),
      setInvestmentCount: (count) =>
        setFiltersRaw((current) => ({
          ...current,
          investmentCount: clamp(count, bounds.minBestInvestmentCount, bounds.maxBestInvestmentCount),
        })),
      setMinVolume: (volume) =>
        setFiltersRaw((current) => ({
          ...current,
          minVolume: clamp(volume, bounds.minVolumeFilter, bounds.maxVolumeFilter),
        })),
      resetFilters,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, maxDaysBack, maxDaysForward, bounds],
  )

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>
}

export function useFilters(): FiltersContextValue {
  const context = useContext(FiltersContext)
  if (!context) {
    throw new Error('useFilters must be used within a FiltersProvider')
  }
  return context
}
