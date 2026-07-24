export interface MarketItem {
  id: string
  name: string
  image: string
  category: string
  detailsId: string
}

export interface HistoryEntry {
  timestamp: string
  rate: number
  volumePrimaryValue: number
}

export interface Pair {
  id: string
  rate: number
  volumePrimaryValue: number
  history: HistoryEntry[]
}

export interface CoreData {
  items: MarketItem[]
  rates: Record<string, number>
  primary: string
  secondary: string
}

export interface ItemEntry {
  item: MarketItem
  pairs: Pair[]
  core: CoreData
}
