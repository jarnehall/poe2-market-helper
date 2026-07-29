// These mirror the PHP backend's API response shapes (see backend/src/Api) —
// not a raw data-storage format like before; the frontend never sees the
// underlying JSON files directly anymore.

export interface MarketItem {
  id: string
  name: string
  image: string
  category: string
  detailsId: string
}

export interface CurrentLeagueInfo {
  name: string
  version: string
  startDate: string
}

export interface LeagueMeta {
  id: string
  name: string
  color: string
  // The current, still-running league — fetched live from poe.ninja instead
  // of a static data/ folder, so it never contributes to best-investments
  // ranking (only shown as an extra overlay line when selected).
  isLive: boolean
}

export interface PairCurrencyMeta {
  id: string
  name: string
}

export interface FilterBounds {
  minDayOfLeague: number
  maxDayOfLeague: number
  minWindowDays: number
  maxWindowDays: number
  defaultDaysBack: number
  defaultDaysForward: number
  minBestInvestmentCount: number
  maxBestInvestmentCount: number
  defaultBestInvestmentCount: number
  minVolumeFilter: number
  maxVolumeFilter: number
  defaultMinVolume: number
}

export interface Meta {
  currentLeague: CurrentLeagueInfo
  leagues: LeagueMeta[]
  categories: string[]
  pairCurrencies: PairCurrencyMeta[]
  bounds: FilterBounds
  visitorCount: number
}

export interface HistoryRow {
  timestamp: string
  rate: number
  volumePrimaryValue: number
  dayOfLeague: number
  percentChange: number | null
}

export interface LeagueChange {
  leagueId: string
  percentChange: number
}

export interface LeagueHistoryRows {
  leagueId: string
  rows: HistoryRow[]
}

// One alternate pair a card's chart can switch to — just enough to redraw
// InvestmentTrend with a different pair, plus its own windowed
// percentChange so the switcher buttons can show which pair actually did
// best (nullable for the same reason as BestInvestment's own — no data at
// all in the current window). No per-league leagueChanges breakdown here,
// unlike BestInvestment itself: that's about which *leagues* agree, not
// relevant to picking a pair.
export interface InvestmentPair {
  pairId: string
  pairName: string
  pairImage: string | null
  percentChange: number | null
  leagueHistories: LeagueHistoryRows[]
}

export interface BestInvestment {
  item: MarketItem
  pairId: string
  pairName: string
  pairImage: string | null
  // Nullable for a pinned favorite with no data at all in the current day
  // window (a best-investments entry, ranked by change, always has one).
  percentChange: number | null
  leagueChanges: LeagueChange[]
  leagueHistories: LeagueHistoryRows[]
  // Every pair this item has data for, including this one — lets a card
  // offer buttons to switch its chart to a different pair client-side.
  pairs: InvestmentPair[]
}

export interface FavoriteItem {
  category: string
  itemId: string
  pairId: string
}

// One entry in the full item catalog the favorites search box matches
// against — everything needed to render a result row and favorite it,
// without waiting for it to show up as a ranked best-investments card.
export interface CatalogItem {
  id: string
  name: string
  image: string
  category: string
  detailsId: string
  pairId: string
}

export interface PoeNinjaStatus {
  // Whether the live league's data was even relevant this request (false
  // when the live league isn't among the requested leagues, or there were
  // no investments to look it up for) — distinct from "checked and found
  // zero failures".
  checked: boolean
  attemptedCount: number
  failedItemIds: string[]
}

export interface BestInvestmentsResponse {
  investments: BestInvestment[]
  poeNinjaStatus: PoeNinjaStatus
}
