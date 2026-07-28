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

export interface BestInvestment {
  item: MarketItem
  pairId: string
  pairName: string
  pairImage: string | null
  percentChange: number
  leagueChanges: LeagueChange[]
  leagueHistories: LeagueHistoryRows[]
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
