import type { BestInvestmentsResponse, Meta } from '../types'

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

export function fetchMeta(signal?: AbortSignal): Promise<Meta> {
  return fetchJson<Meta>('/api/meta', signal)
}

export interface BestInvestmentsParams {
  leagues: string[]
  categories: string[]
  pairCurrencies: string[]
  currentDayOfLeague: number
  daysBack: number
  daysForward: number
  count: number
  minVolume: number
}

export function fetchBestInvestments(
  params: BestInvestmentsParams,
  signal?: AbortSignal,
): Promise<BestInvestmentsResponse> {
  const query = new URLSearchParams({
    leagues: params.leagues.join(','),
    categories: params.categories.join(','),
    pairCurrencies: params.pairCurrencies.join(','),
    currentDayOfLeague: String(params.currentDayOfLeague),
    daysBack: String(params.daysBack),
    daysForward: String(params.daysForward),
    count: String(params.count),
    minVolume: String(params.minVolume),
  })

  return fetchJson<BestInvestmentsResponse>(`/api/best-investments?${query.toString()}`, signal)
}
