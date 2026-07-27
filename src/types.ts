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

export interface BestInvestmentsResponse {
  investments: BestInvestment[]
}
