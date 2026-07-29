import type { MarketItem } from '../types'

const IMAGE_BASE_URL = 'https://web.poecdn.com'

export function getImageUrl(imagePath: string): string {
  return `${IMAGE_BASE_URL}${imagePath}`
}

// poe.ninja's own URL slug for a category isn't always just its lowercased
// name (e.g. our "Lineage Gems" is their "lineage-support-gems") — add an
// entry here for any category that doesn't follow the simple pattern.
const POE_NINJA_CATEGORY_SLUGS: Record<string, string> = {
  'Lineage Gems': 'lineage-support-gems',
  Abyss: 'abyssal-bones',
}

// The poe.ninja economy page for an item, always under the current league
// (from the CURRENT_LEAGUE env var, falling back to whichever league name
// the caller passes in) regardless of which league's card this item came from.
export function getPoeNinjaUrl(item: MarketItem, fallbackLeagueName: string): string {
  const leagueSlug = String(import.meta.env.CURRENT_LEAGUE ?? fallbackLeagueName)
    .replace(/\s+/g, '')
    .toLowerCase()
  const categorySlug =
    POE_NINJA_CATEGORY_SLUGS[item.category] ?? item.category.toLowerCase().replace(/\s+/g, '-')
  return `https://poe.ninja/poe2/economy/${leagueSlug}/${categorySlug}/${item.detailsId}`
}

// Always today, truncated to UTC midnight to match the daily granularity of
// the history data — recomputed on every load instead of a hardcoded date
// that'd otherwise need updating by hand as real time moves on.
function getTodayAtUtcMidnight(): string {
  const now = new Date()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString()
}

export const DEFAULT_CURRENT_DATE = getTodayAtUtcMidnight()

const MS_PER_DAY = 24 * 60 * 60 * 1000

// Rounds UP to the next UTC midnight (a no-op if already exact) — a
// league's startDate is a real launch moment (e.g. 19:00Z), and no history
// snapshot can exist before that moment, so the first midnight-anchored
// daily snapshot that can possibly reflect real data is the *next* one
// after startDate, not startDate's own calendar day. This mirrors the
// backend's identical rounding in MarketData::getAllHistoryRows — both need
// to agree on which dayOfLeague number "today" is.
function ceilToUtcMidnight(epochMs: number): number {
  return Math.ceil(epochMs / MS_PER_DAY) * MS_PER_DAY
}

export function getDayOfLeagueForDate(date: string, leagueStartDate: string): number {
  return (
    Math.round(
      (ceilToUtcMidnight(new Date(date).getTime()) -
        ceilToUtcMidnight(new Date(leagueStartDate).getTime())) /
        MS_PER_DAY,
    ) + 1
  )
}
