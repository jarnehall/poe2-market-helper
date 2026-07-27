import { createContext, useContext, useMemo, useState } from 'react'
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
  // draft: mutated instantly by every filter control, for their own visual
  // feedback. applied: the last-submitted values — the only thing ever sent
  // to the API. Both expose daysBack/daysForward already clamped to how far
  // their own currentDayOfLeague is from the day-of-league bounds.
  draft: FiltersState
  applied: FiltersState
  maxDraftDaysBack: number
  maxDraftDaysForward: number
  isDirty: boolean
  toggleDraftCategory: (category: string) => void
  toggleDraftPairCurrency: (pairId: string) => void
  setDraftCurrentDayOfLeague: (day: number) => void
  setDraftDaysBack: (days: number) => void
  setDraftDaysForward: (days: number) => void
  setDraftInvestmentCount: (count: number) => void
  setDraftMinVolume: (volume: number) => void
  applyFilters: () => void
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

  const storedApplied = (): FiltersState => {
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

  const [appliedRaw, setAppliedRaw] = useState<FiltersState>(storedApplied)
  const [draftRaw, setDraftRaw] = useState<FiltersState>(appliedRaw)

  const persist = (state: FiltersState) => {
    setStoredStringArray('selectedCategories', state.categories)
    setStoredStringArray('selectedPairCurrencies', state.pairCurrencies)
    setStoredNumber('currentDayOfLeague', state.currentDayOfLeague)
    setStoredNumber('daysBack', state.daysBack)
    setStoredNumber('daysForward', state.daysForward)
    setStoredNumber('investmentCount', state.investmentCount)
    setStoredNumber('minVolume', state.minVolume)
  }

  // Days back/forward can never reach further than the day-of-league range
  // there's data for, so their effective max shrinks as currentDayOfLeague
  // nears either edge — mirroring the old TrendWindowContext.
  const maxDraftDaysBack = draftRaw.currentDayOfLeague - bounds.minDayOfLeague
  const maxDraftDaysForward = bounds.maxDayOfLeague - draftRaw.currentDayOfLeague
  const maxAppliedDaysBack = appliedRaw.currentDayOfLeague - bounds.minDayOfLeague
  const maxAppliedDaysForward = bounds.maxDayOfLeague - appliedRaw.currentDayOfLeague

  // Memoized on draftRaw/appliedRaw (stable useState references, only ever
  // replaced by their own setters) so `draft`/`applied` keep a stable
  // identity across unrelated re-renders — otherwise every consumer's
  // effect keyed on `applied` (like the best-investments fetch) would
  // refire on every draft keystroke/drag, not just on an actual apply.
  const draft = useMemo<FiltersState>(
    () => ({
      ...draftRaw,
      daysBack: Math.min(draftRaw.daysBack, maxDraftDaysBack),
      daysForward: Math.min(draftRaw.daysForward, maxDraftDaysForward),
    }),
    [draftRaw, maxDraftDaysBack, maxDraftDaysForward],
  )
  const applied = useMemo<FiltersState>(
    () => ({
      ...appliedRaw,
      daysBack: Math.min(appliedRaw.daysBack, maxAppliedDaysBack),
      daysForward: Math.min(appliedRaw.daysForward, maxAppliedDaysForward),
    }),
    [appliedRaw, maxAppliedDaysBack, maxAppliedDaysForward],
  )

  const isDirty =
    draft.currentDayOfLeague !== applied.currentDayOfLeague ||
    draft.daysBack !== applied.daysBack ||
    draft.daysForward !== applied.daysForward ||
    draft.investmentCount !== applied.investmentCount ||
    draft.minVolume !== applied.minVolume ||
    draft.categories.length !== applied.categories.length ||
    draft.pairCurrencies.length !== applied.pairCurrencies.length ||
    !draft.categories.every((category) => applied.categories.includes(category)) ||
    !draft.pairCurrencies.every((pairId) => applied.pairCurrencies.includes(pairId))

  const applyFilters = () => {
    setAppliedRaw(draftRaw)
    persist(draftRaw)
  }

  const resetFilters = () => {
    const defaults = defaultFilters()
    setDraftRaw(defaults)
    setAppliedRaw(defaults)
    persist(defaults)
  }

  const value = useMemo<FiltersContextValue>(
    () => ({
      draft,
      applied,
      maxDraftDaysBack,
      maxDraftDaysForward,
      isDirty,
      toggleDraftCategory: (category) =>
        setDraftRaw((current) => ({
          ...current,
          categories: current.categories.includes(category)
            ? current.categories.filter((c) => c !== category)
            : [...current.categories, category],
        })),
      toggleDraftPairCurrency: (pairId) =>
        setDraftRaw((current) => ({
          ...current,
          pairCurrencies: current.pairCurrencies.includes(pairId)
            ? current.pairCurrencies.filter((p) => p !== pairId)
            : [...current.pairCurrencies, pairId],
        })),
      setDraftCurrentDayOfLeague: (day) =>
        setDraftRaw((current) => ({
          ...current,
          currentDayOfLeague: clamp(day, bounds.minDayOfLeague, bounds.maxDayOfLeague),
        })),
      setDraftDaysBack: (days) =>
        setDraftRaw((current) => ({ ...current, daysBack: Math.max(bounds.minWindowDays, days) })),
      setDraftDaysForward: (days) =>
        setDraftRaw((current) => ({ ...current, daysForward: Math.max(bounds.minWindowDays, days) })),
      setDraftInvestmentCount: (count) =>
        setDraftRaw((current) => ({
          ...current,
          investmentCount: clamp(count, bounds.minBestInvestmentCount, bounds.maxBestInvestmentCount),
        })),
      setDraftMinVolume: (volume) =>
        setDraftRaw((current) => ({
          ...current,
          minVolume: clamp(volume, bounds.minVolumeFilter, bounds.maxVolumeFilter),
        })),
      applyFilters,
      resetFilters,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, applied, maxDraftDaysBack, maxDraftDaysForward, isDirty, bounds],
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
