import type { BestInvestmentsResponse, CatalogItem, CurrentLeaguesByGame, FavoriteItem, Game, Meta } from '../types'

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Request failed: ${response.status}`
    throw new Error(message)
  }

  return body as T
}

export function fetchMeta(game: Game, signal?: AbortSignal): Promise<Meta> {
  return fetchJson<Meta>(`/api/meta?game=${game}`, signal)
}

export interface BestInvestmentsParams {
  game: Game
  leagues: string[]
  categories: string[]
  pairCurrencies: string[]
  currentDayOfLeague: number
  daysBack: number
  daysForward: number
  count: number
  minVolume: number
  useAveragePairs: boolean
}

export function fetchBestInvestments(
  params: BestInvestmentsParams,
  signal?: AbortSignal,
): Promise<BestInvestmentsResponse> {
  const query = new URLSearchParams({
    game: params.game,
    leagues: params.leagues.join(','),
    categories: params.categories.join(','),
    pairCurrencies: params.pairCurrencies.join(','),
    currentDayOfLeague: String(params.currentDayOfLeague),
    daysBack: String(params.daysBack),
    daysForward: String(params.daysForward),
    count: String(params.count),
    minVolume: String(params.minVolume),
    useAveragePairs: String(params.useAveragePairs),
  })

  return fetchJson<BestInvestmentsResponse>(`/api/best-investments?${query.toString()}`, signal)
}

export interface FavoritesParams {
  game: Game
  favorites: FavoriteItem[]
  leagues: string[]
  currentDayOfLeague: number
  daysBack: number
  daysForward: number
}

export function fetchFavorites(
  params: FavoritesParams,
  signal?: AbortSignal,
): Promise<BestInvestmentsResponse> {
  const query = new URLSearchParams({
    game: params.game,
    leagues: params.leagues.join(','),
    currentDayOfLeague: String(params.currentDayOfLeague),
    daysBack: String(params.daysBack),
    daysForward: String(params.daysForward),
    pins: JSON.stringify(params.favorites),
  })

  return fetchJson<BestInvestmentsResponse>(`/api/favorites?${query.toString()}`, signal)
}

export function fetchItemsCatalog(game: Game, signal?: AbortSignal): Promise<{ items: CatalogItem[] }> {
  return fetchJson<{ items: CatalogItem[] }>(`/api/items?game=${game}`, signal)
}

// Not game-scoped, unlike everything above — used only to decide which
// game's route "/" should redirect to (see App.tsx).
export function fetchCurrentLeagues(signal?: AbortSignal): Promise<CurrentLeaguesByGame> {
  return fetchJson<CurrentLeaguesByGame>('/api/current-leagues', signal)
}
