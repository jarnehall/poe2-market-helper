import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_CURRENT_DATE, getDayOfLeagueForDate } from '../lib/marketData'
import {
  getStoredBoolean,
  getStoredNumber,
  getStoredNumberRecord,
  getStoredStringArray,
  setStoredBoolean,
  setStoredNumber,
  setStoredNumberRecord,
  setStoredStringArray,
} from '../lib/storage'
import { getUrlParam, sameElements, setUrlParams, splitUrlList } from '../lib/urlParams'
import { useGame } from './GameContext'
import { useLeague } from './LeagueContext'
import { useMeta } from './MetaContext'

// Short, shareable query keys — kept intentionally terse (see setUrlParams
// callers below) so a link carrying someone's exact settings stays short:
// d=day, db=days-back, df=days-forward, n=investment count, v=min volume,
// c=categories, p=pair currencies (traded against), pa=use pure averages,
// lw=league weights. No key of its own for useAveragePairs — it's no longer
// independently settable (see FiltersState's own comment on it below).
const URL_KEYS = {
  currentDayOfLeague: 'd',
  daysBack: 'db',
  daysForward: 'df',
  investmentCount: 'n',
  minVolume: 'v',
  categories: 'c',
  pairCurrencies: 'p',
  usePureAverages: 'pa',
  leagueWeights: 'lw',
} as const

function parseUrlNumber(raw: string, fallback: number): number {
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

// Same "id:weight,id:weight" shape sent to the API (see lib/api.ts and the
// PHP-side QueryParams::parseWeightMap it mirrors) — not JSON, to match this
// app's existing terse comma-separated param style everywhere else.
function encodeLeagueWeights(weights: Record<string, number>): string {
  return Object.entries(weights)
    .map(([id, weight]) => `${id}:${weight}`)
    .join(',')
}

function parseLeagueWeights(raw: string): Record<string, number> {
  const weights: Record<string, number> = {}
  for (const pair of splitUrlList(raw)) {
    const separatorIndex = pair.indexOf(':')
    if (separatorIndex <= 0) continue
    const id = pair.slice(0, separatorIndex)
    const weight = Number(pair.slice(separatorIndex + 1))
    if (Number.isFinite(weight)) weights[id] = weight
  }
  return weights
}

// Recency-weighted ranking's default per-league weights when the user
// hasn't customized them via the sliders — geometric decay favoring more
// recently-started leagues, each subsequent one (already sorted latest
// first by the caller) getting a third of the previous one's weight,
// normalized to sum to 100. For 3 leagues that's roughly 69/23/8; for 1
// it's just 100. Mirrors MarketData::defaultLeagueWeights on the backend,
// which falls back to the exact same formula if a request ever omits
// leagueWeights entirely.
function computeDefaultLeagueWeights(sortedLeagueIds: string[]): Record<string, number> {
  const ratio = 1 / 3
  const raw = sortedLeagueIds.map((_, index) => ratio ** index)
  const sum = raw.reduce((total, value) => total + value, 0)

  const weights: Record<string, number> = {}
  sortedLeagueIds.forEach((id, index) => {
    weights[id] = sum > 0 ? (raw[index] / sum) * 100 : 0
  })
  return weights
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
  // best-performing one (see MarketData::getBestInvestmentsForWindow). No
  // longer independently settable — always forced on exactly when
  // usePureAverages is (see the `filters` memo in FiltersProvider, which
  // is the only place this ever actually gets set); the value stored here
  // on filtersRaw itself is never read.
  useAveragePairs: boolean
  // false (the default): rank by leagueWeights below instead of a plain
  // average across leagues — see MarketData::getRankedInvestments' own doc
  // comment for exactly what that means. Never affects any displayed
  // number (percentChange, leagueChanges) on a card, only the order cards
  // appear in.
  usePureAverages: boolean
  // One entry per currently selected (non-live) league, summing to 100 —
  // only meaningful when usePureAverages is false. Reset to
  // computeDefaultLeagueWeights whenever the selected league *set* changes
  // (see the effect in FiltersProvider below); customizing it otherwise
  // persists like every other filter.
  leagueWeights: Record<string, number>
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
  setUsePureAverages: (usePureAverages: boolean) => void
  // Sets `leagueId`'s weight to `weight` (0-100) and redistributes the
  // remainder across every other currently-weighted league, proportional
  // to their own current relative shares — so the whole set keeps summing
  // to 100 without the caller needing to compute the others itself.
  setLeagueWeight: (leagueId: string, weight: number) => void
  resetFilters: () => void
}

const FiltersContext = createContext<FiltersContextValue | null>(null)

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// The classic "linked sliders" redistribution: `leagueId` takes exactly
// `weight`, and whatever's left over (100 - weight) is split across every
// other league in the same proportion they already had *to each other* —
// so nudging one slider shifts the others smoothly instead of e.g. always
// taking evenly from both. Falls back to an even split only if the others
// were somehow all zero (nothing to preserve a ratio from).
function redistributeLeagueWeights(
  current: Record<string, number>,
  changedLeagueId: string,
  weight: number,
): Record<string, number> {
  const clampedWeight = clamp(weight, 0, 100)
  const otherIds = Object.keys(current).filter((id) => id !== changedLeagueId)

  if (otherIds.length === 0) {
    return { ...current, [changedLeagueId]: 100 }
  }

  const remainder = 100 - clampedWeight
  const othersTotal = otherIds.reduce((sum, id) => sum + (current[id] ?? 0), 0)

  const next: Record<string, number> = { [changedLeagueId]: clampedWeight }
  if (othersTotal > 0) {
    otherIds.forEach((id) => {
      next[id] = ((current[id] ?? 0) / othersTotal) * remainder
    })
  } else {
    const evenShare = remainder / otherIds.length
    otherIds.forEach((id) => {
      next[id] = evenShare
    })
  }

  return next
}

// Within half a percentage point of each other, for every league in both —
// exact equality would almost never hold since a's/redistributeLeagueWeights'
// own float division rarely lands on the same value computeDefaultLeagueWeights
// would, even when nothing meaningful has actually changed.
function leagueWeightsMatch(a: Record<string, number>, b: Record<string, number>): boolean {
  const aIds = Object.keys(a)
  if (!sameElements(aIds, Object.keys(b))) return false
  return aIds.every((id) => Math.abs(a[id] - b[id]) < 0.5)
}

export function FiltersProvider({ children }: { children: ReactNode }) {
  const meta = useMeta()
  const { bounds } = meta
  const { game } = useGame()
  const { selectedLeagueIds } = useLeague()

  // Latest-started first — the order default league weights decay across
  // (see computeDefaultLeagueWeights) and the order the sliders themselves
  // are shown in. selectedLeagueIds never includes the live league (see
  // LeagueContext), so there's no need to filter it out here too.
  const leagueById = new Map(meta.leagues.map((league) => [league.id, league]))
  const sortedSelectedLeagueIds = [...selectedLeagueIds].sort((a, b) => {
    const dateA = leagueById.get(a)?.startDate ?? ''
    const dateB = leagueById.get(b)?.startDate ?? ''
    return dateB > dateA ? 1 : dateB < dateA ? -1 : 0
  })
  // A stable primitive to key effects/memoization on — sortedSelectedLeagueIds
  // itself is a fresh array every render regardless of whether its actual
  // contents changed.
  const sortedSelectedLeagueIdsKey = sortedSelectedLeagueIds.join(',')

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
    // Never read (see this field's own comment above) — just a type-shaped
    // placeholder here.
    useAveragePairs: false,
    usePureAverages: false,
    leagueWeights: computeDefaultLeagueWeights(sortedSelectedLeagueIds),
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
    const urlPureAverages = getUrlParam(URL_KEYS.usePureAverages)
    const urlLeagueWeights = getUrlParam(URL_KEYS.leagueWeights)

    // A stored (or shared-link) weight map only makes sense for the *exact*
    // set of leagues it was saved for — if the current selection has since
    // changed (a league added/removed), there's nothing sensible to map a
    // stale per-league weight onto, so this falls back to a freshly
    // computed default for the current selection instead.
    const storedLeagueWeights = getStoredNumberRecord(`${game}:leagueWeights`, defaults.leagueWeights)
    const leagueWeights =
      urlLeagueWeights !== null
        ? parseLeagueWeights(urlLeagueWeights)
        : storedLeagueWeights
    const resolvedLeagueWeights = sameElements(Object.keys(leagueWeights), sortedSelectedLeagueIds)
      ? leagueWeights
      : defaults.leagueWeights

    return {
      categories:
        urlCategories !== null
          ? splitUrlList(urlCategories).filter((category) => meta.categories.includes(category))
          : getStoredStringArray(`${game}:selectedCategories`, defaults.categories),
      pairCurrencies:
        urlPairCurrencies !== null
          ? splitUrlList(urlPairCurrencies).filter((id) =>
              meta.pairCurrencies.some((pairCurrency) => pairCurrency.id === id),
            )
          : getStoredStringArray(`${game}:selectedPairCurrencies`, defaults.pairCurrencies),
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
          : getStoredNumber(`${game}:daysBack`, defaults.daysBack),
      daysForward:
        urlDaysForward !== null
          ? parseUrlNumber(urlDaysForward, defaults.daysForward)
          : getStoredNumber(`${game}:daysForward`, defaults.daysForward),
      investmentCount:
        urlCount !== null
          ? clamp(
              parseUrlNumber(urlCount, defaults.investmentCount),
              bounds.minBestInvestmentCount,
              bounds.maxBestInvestmentCount,
            )
          : getStoredNumber(`${game}:investmentCount`, defaults.investmentCount),
      minVolume:
        urlVolume !== null
          ? clamp(parseUrlNumber(urlVolume, defaults.minVolume), bounds.minVolumeFilter, bounds.maxVolumeFilter)
          : getStoredNumber(`${game}:minVolume`, defaults.minVolume),
      // Never read (see this field's own comment on FiltersState above).
      useAveragePairs: false,
      usePureAverages:
        urlPureAverages !== null
          ? urlPureAverages === 'true'
          : getStoredBoolean(`${game}:usePureAverages`, defaults.usePureAverages),
      leagueWeights: resolvedLeagueWeights,
    }
  }

  const [filtersRaw, setFiltersRaw] = useState<FiltersState>(storedFilters)

  // Persisting as its own effect (rather than inline in every setter) keeps
  // each setter a plain state update — this is the one place that actually
  // writes to localStorage, running once per resolved change regardless of
  // how many setters fired to get there.
  useEffect(() => {
    setStoredStringArray(`${game}:selectedCategories`, filtersRaw.categories)
    setStoredStringArray(`${game}:selectedPairCurrencies`, filtersRaw.pairCurrencies)
    setStoredNumber(`${game}:daysBack`, filtersRaw.daysBack)
    setStoredNumber(`${game}:daysForward`, filtersRaw.daysForward)
    setStoredNumber(`${game}:investmentCount`, filtersRaw.investmentCount)
    setStoredNumber(`${game}:minVolume`, filtersRaw.minVolume)
    setStoredBoolean(`${game}:usePureAverages`, filtersRaw.usePureAverages)
    setStoredNumberRecord(`${game}:leagueWeights`, filtersRaw.leagueWeights)
  }, [game, filtersRaw])

  // The league weight sliders are keyed to whichever leagues are *currently*
  // selected — if that set changes (a league toggled on/off in the Leagues
  // dropdown), any customized weights were for a different set of sliders
  // entirely and no longer mean anything, so this resets to a freshly
  // computed default for the new set. A no-op (via the setState bailout —
  // returning the same object skips the re-render) once the weights already
  // match the current selection, so this doesn't fight with a slider drag.
  useEffect(() => {
    setFiltersRaw((current) =>
      sameElements(Object.keys(current.leagueWeights), sortedSelectedLeagueIds)
        ? current
        : { ...current, leagueWeights: computeDefaultLeagueWeights(sortedSelectedLeagueIds) },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedSelectedLeagueIdsKey])

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
      // "Average all pairs" no longer has its own setting (see
      // FiltersState's own comment on this field) — forced on exactly when
      // pure averages is, off otherwise.
      useAveragePairs: filtersRaw.usePureAverages,
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
      [URL_KEYS.usePureAverages]: filters.usePureAverages ? 'true' : null,
      [URL_KEYS.leagueWeights]: leagueWeightsMatch(filters.leagueWeights, defaults.leagueWeights)
        ? null
        : encodeLeagueWeights(filters.leagueWeights),
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
      // No separate useAveragePairs check — it's fully derived from
      // usePureAverages (see the `filters` memo above), so the check just
      // above already covers it.
      filters.usePureAverages === defaults.usePureAverages &&
      leagueWeightsMatch(filters.leagueWeights, defaults.leagueWeights)
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
      setUsePureAverages: (usePureAverages) =>
        setFiltersRaw((current) => ({ ...current, usePureAverages })),
      setLeagueWeight: (leagueId, weight) =>
        setFiltersRaw((current) => ({
          ...current,
          leagueWeights: redistributeLeagueWeights(current.leagueWeights, leagueId, weight),
        })),
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
