// Shared by FiltersContext/LeagueContext so a link can carry someone's exact
// (non-default) settings — each context owns its own subset of short query
// keys (see their own getUrlParam/setUrlParams calls) and never touches the
// other's, so this stays a plain merge into whatever's already in the URL.

export function getUrlParam(key: string): string | null {
  return new URLSearchParams(window.location.search).get(key)
}

// A key mapped to `null` is removed from the query string entirely (used
// whenever a value matches its default — the URL should only ever carry
// what's actually been changed); anything else is set/overwritten. Replaces
// the current history entry rather than pushing a new one, so dragging a
// slider doesn't fill up the back button with one stop per tick.
export function setUrlParams(updates: Record<string, string | null>): void {
  const params = new URLSearchParams(window.location.search)
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
  }

  const query = params.toString()
  const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
  window.history.replaceState(null, '', newUrl)
}

// Comma-separated list values (categories, pair currencies, league ids) —
// an explicit empty string means "empty list", not "absent".
export function splitUrlList(raw: string): string[] {
  return raw === '' ? [] : raw.split(',')
}

export function sameElements(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((item) => setB.has(item))
}
