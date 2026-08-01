import type { Game, MarketItem } from '../types'

const IMAGE_BASE_URL = 'https://web.poecdn.com'

export function getImageUrl(imagePath: string): string {
  return `${IMAGE_BASE_URL}${imagePath}`
}

// Same Divine/Chaos Orb icon shown throughout the app for that game's
// primary currency — purely decorative header branding, not tied to any
// particular league's data, so these are fixed paths rather than looked up
// per-request.
const HEADER_IMAGES: Record<Game, string> = {
  poe2: '/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lNb2RWYWx1ZXMiLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/2986e220b3/CurrencyModValues.png',
  // Chaos Orb — POE1's actual "primary" reference currency, unlike POE2
  // where the Divine Orb fills that role. Path taken verbatim from the
  // ingested Mirage snapshot's own `core.items` entry for it (data/poe1/
  // mirage/currency.json), not guessed — poe.ninja's per-realm image hashes
  // for the "same" icon differ, so this can't be copied from POE2's asset.
  poe1: '/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxSYXJlIiwic2NhbGUiOjF9XQ/46a2347805/CurrencyRerollRare.png',
}

export function getHeaderImage(game: Game): string {
  return getImageUrl(HEADER_IMAGES[game])
}

// poe.ninja's own URL slug for a category isn't always just its lowercased
// name (e.g. our "Lineage Gems" is their "lineage-support-gems") — add an
// entry here for any category that doesn't follow the simple pattern.
// POE1 has no such overrides yet (only Currency is ingested, which already
// follows the simple pattern).
const POE_NINJA_CATEGORY_SLUGS: Record<Game, Record<string, string>> = {
  poe2: {
    'Lineage Gems': 'lineage-support-gems',
    Abyss: 'abyssal-bones',
  },
  poe1: {},
}

// The poe.ninja economy page for an item, always under the current league
// (from the CURRENT_LEAGUE env var for POE2, falling back to the caller's
// poeNinjaLeagueName — POE2's env var takes priority there since it's fixed
// to POE2's own current league) regardless of which league's card this item
// came from. poeNinjaLeagueName should be currentLeague.poeNinjaLeague (see
// types.ts), not currentLeague.name — poe.ninja's own URL slug for a league
// isn't always its display name lowercased (e.g. POE1's "Curse of the
// Allflame" is poe.ninja's "allflame").
export function getPoeNinjaUrl(item: MarketItem, poeNinjaLeagueName: string, game: Game): string {
  const leagueName =
    game === 'poe2' ? String(import.meta.env.CURRENT_LEAGUE ?? poeNinjaLeagueName) : poeNinjaLeagueName
  const leagueSlug = leagueName.replace(/\s+/g, '').toLowerCase()
  const categorySlug =
    POE_NINJA_CATEGORY_SLUGS[game][item.category] ?? item.category.toLowerCase().replace(/\s+/g, '-')
  return `https://poe.ninja/${game}/economy/${leagueSlug}/${categorySlug}/${item.detailsId}`
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
