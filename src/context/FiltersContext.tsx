import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_CURRENT_DATE, getDayOfLeagueForDate } from '../lib/marketData'
import {
  getStoredBoolean,
  getStoredNumber,
  getStoredStringArray,
  setStoredBoolean,
  setStoredNumber,
  setStoredStringArray,
} from '../lib/storage'
import { getUrlParam, sameElements, setUrlParams, splitUrlList } from '../lib/urlParams'
import { useMeta } from './MetaContext'

// Short, shareable query keys — kept intentionally terse (see setUrlParams
// callers below) so a link carrying someone's exact settings stays short:
// d=day, db=days-back, df=days-forward, n=investment count, v=min volume,
// a=average-pairs, c=categories, p=pair currencies (traded against).
const URL_KEYS = {
  currentDayOfLeague: 'd',
  daysBack: 'db',
  daysForward: 'df',
  investmentCount: 'n',
  minVolume: 'v',
  useAveragePairs: 'a',
  categories: 'c',
  pairCurrencies: 'p',
} as const

function parseUrlNumber(raw: string, fallback: number): number {
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

export interface FiltersState {
  categories: string[]
  pairCurrencies: string[]
  currentDayOfLeague: number
  daysBack: number
  daysForward: number
  investmentCount: number
  minVolume: number
  // When true, an item's displayed/ranked percentChange is the average
  // across every pair it qualifies with, instead of just its
  // best-performing one (see MarketData::getBestInvestmentsForWindow).
  useAveragePairs: boolean
}

interface FiltersContextValue {
  // Every setter takes effect immediately (persisted to localStorage and
  // sent to the API on the next request) — there's no separate "apply"
  // step. daysBack/daysForward are already clamped to how far
  // currentDayOfLeague is from the day-of-league bounds.
  filters: FiltersState
  maxDaysBack: number
  maxDaysForward: number
  // True when every field already matches its computed default — lets a
  // "Reset all filters" control disable itself rather than being a no-op.
  isDefault: boolean
  toggleCategory: (category: string) => void
  togglePairCurrency: (pairId: string) => void
  setCurrentDayOfLeague: (day: number) => void
  setDaysBack: (days: number) => void
  setDaysForward: (days: number) => void
  setInvestmentCount: (count: number) => void
  setMinVolume: (volume: number) => void
  setUseAveragePairs: (useAveragePairs: boolean) => void
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
    useAveragePairs: false,
  })

  // A query param always wins over both localStorage and the computed
  // default — that's the whole point of a shareable link: opening someone
  // else's URL should show *their* settings regardless of whatever this
  // browser already had saved.
  const storedFilters = (): FiltersState => {
    const defaults = defaultFilters()

    const urlCategories = getUrlParam(URL_KEYS.categories)
    const urlPairCurrencies = getUrlParam(URL_KEYS.pairCurrencies)
    const urlDay = getUrlParam(URL_KEYS.currentDayOfLeague)
    const urlDaysBack = getUrlParam(URL_KEYS.daysBack)
    const urlDaysForward = getUrlParam(URL_KEYS.daysForward)
    const urlCount = getUrlParam(URL_KEYS.investmentCount)
    const urlVolume = getUrlParam(URL_KEYS.minVolume)
    const urlAverage = getUrlParam(URL_KEYS.useAveragePairs)

    return {
      categories:
        urlCategories !== null
          ? splitUrlList(urlCategories).filter((category) => meta.categories.includes(category))
          : getStoredStringArray('selectedCategories', defaults.categories),
      pairCurrencies:
        urlPairCurrencies !== null
          ? splitUrlList(urlPairCurrencies).filter((id) =>
              meta.pairCurrencies.some((pairCurrency) => pairCurrency.id === id),
            )
          : getStoredStringArray('selectedPairCurrencies', defaults.pairCurrencies),
      // Deliberately not read from localStorage otherwise — the day slider
      // should always default to today's date, not the last day this
      // browser viewed — but an explicit ?d= from a shared link still wins.
      currentDayOfLeague:
        urlDay !== null
          ? clamp(parseUrlNumber(urlDay, defaults.currentDayOfLeague), bounds.minDayOfLeague, bounds.maxDayOfLeague)
          : defaults.currentDayOfLeague,
      daysBack:
        urlDaysBack !== null
          ? parseUrlNumber(urlDaysBack, defaults.daysBack)
          : getStoredNumber('daysBack', defaults.daysBack),
      daysForward:
        urlDaysForward !== null
          ? parseUrlNumber(urlDaysForward, defaults.daysForward)
          : getStoredNumber('daysForward', defaults.daysForward),
      investmentCount:
        urlCount !== null
          ? clamp(
              parseUrlNumber(urlCount, defaults.investmentCount),
              bounds.minBestInvestmentCount,
              bounds.maxBestInvestmentCount,
            )
          : getStoredNumber('investmentCount', defaults.investmentCount),
      minVolume:
        urlVolume !== null
          ? clamp(parseUrlNumber(urlVolume, defaults.minVolume), bounds.minVolumeFilter, bounds.maxVolumeFilter)
          : getStoredNumber('minVolume', defaults.minVolume),
      useAveragePairs:
        urlAverage !== null ? urlAverage === '1' : getStoredBoolean('useAveragePairs', defaults.useAveragePairs),
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
    setStoredNumber('daysBack', filtersRaw.daysBack)
    setStoredNumber('daysForward', filtersRaw.daysForward)
    setStoredNumber('investmentCount', filtersRaw.investmentCount)
    setStoredNumber('minVolume', filtersRaw.minVolume)
    setStoredBoolean('useAveragePairs', filtersRaw.useAveragePairs)
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

  // Keeps the URL's query string in sync with whatever's actually different
  // from default — the reverse of storedFilters() above — so the address
  // bar always reflects a link someone could share to reproduce this exact
  // view. A field that matches its default is removed from the URL rather
  // than written as its default value, so the URL only ever grows for
  // choices that actually diverge.
  useEffect(() => {
    const defaults = defaultFilters()
    setUrlParams({
      [URL_KEYS.categories]: sameElements(filters.categories, defaults.categories)
        ? null
        : filters.categories.join(','),
      [URL_KEYS.pairCurrencies]: sameElements(filters.pairCurrencies, defaults.pairCurrencies)
        ? null
        : filters.pairCurrencies.join(','),
      [URL_KEYS.currentDayOfLeague]:
        filters.currentDayOfLeague === defaults.currentDayOfLeague ? null : String(filters.currentDayOfLeague),
      [URL_KEYS.daysBack]: filters.daysBack === defaults.daysBack ? null : String(filters.daysBack),
      [URL_KEYS.daysForward]: filters.daysForward === defaults.daysForward ? null : String(filters.daysForward),
      [URL_KEYS.investmentCount]:
        filters.investmentCount === defaults.investmentCount ? null : String(filters.investmentCount),
      [URL_KEYS.minVolume]: filters.minVolume === defaults.minVolume ? null : String(filters.minVolume),
      [URL_KEYS.useAveragePairs]: filters.useAveragePairs ? '1' : null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const isDefault = useMemo(() => {
    const defaults = defaultFilters()
    return (
      sameElements(filters.categories, defaults.categories) &&
      sameElements(filters.pairCurrencies, defaults.pairCurrencies) &&
      filters.currentDayOfLeague === defaults.currentDayOfLeague &&
      filters.daysBack === defaults.daysBack &&
      filters.daysForward === defaults.daysForward &&
      filters.investmentCount === defaults.investmentCount &&
      filters.minVolume === defaults.minVolume &&
      filters.useAveragePairs === defaults.useAveragePairs
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const value = useMemo<FiltersContextValue>(
    () => ({
      filters,
      maxDaysBack,
      maxDaysForward,
      isDefault,
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
      setUseAveragePairs: (useAveragePairs) =>
        setFiltersRaw((current) => ({ ...current, useAveragePairs })),
      resetFilters: () => setFiltersRaw(defaultFilters()),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, maxDaysBack, maxDaysForward, isDefault, bounds],
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
