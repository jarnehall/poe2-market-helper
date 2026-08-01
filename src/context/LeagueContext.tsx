import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getStoredStringArray, setStoredStringArray } from '../lib/storage'
import { getUrlParam, sameElements, setUrlParams, splitUrlList } from '../lib/urlParams'
import type { LeagueMeta } from '../types'
import { useGame } from './GameContext'
import { useMeta } from './MetaContext'

// l=selected league ids — see FiltersContext's URL_KEYS for the rest of the
// shareable-link query keys.
const LEAGUES_URL_KEY = 'l'

interface LeagueContextValue {
  leagues: LeagueMeta[]
  selectableLeagues: LeagueMeta[]
  liveLeague: LeagueMeta | null
  selectedLeagueIds: string[]
  selectedLeagues: LeagueMeta[]
  isLeagueSelected: (leagueId: string) => boolean
  toggleLeague: (leagueId: string) => void
  // True when the selection already matches the default (every selectable
  // league) — lets a "Reset all filters" control disable itself rather
  // than being a no-op.
  isDefaultSelection: boolean
  resetLeagues: () => void
  // Which league's badge (if any) is currently hovered — purely ephemeral
  // UI state (not persisted), read by every chart on the page so hovering
  // one badge can highlight that league's line across all of them at once.
  hoveredLeagueId: string | null
  setHoveredLeagueId: (leagueId: string | null) => void
}

const LeagueContext = createContext<LeagueContextValue | null>(null)

export function LeagueProvider({ children }: { children: ReactNode }) {
  const { leagues } = useMeta()
  const { game } = useGame()

  // The live league never contributes to best-investments ranking on its
  // own (its data is a display-only overlay, always fetched regardless of
  // selection — see MarketOverview) so it's excluded from the set a user
  // can toggle on/off entirely, not just from the default.
  const selectableLeagues = useMemo(() => leagues.filter((league) => !league.isLive), [leagues])
  const liveLeague = useMemo(() => leagues.find((league) => league.isLive) ?? null, [leagues])

  // Every selectable league, not just the first — falls back to the live
  // league alone in the (real-world impossible today, but not type-
  // guaranteed) case where a game has no static leagues at all yet.
  const defaultLeagueIds = useMemo(() => {
    if (selectableLeagues.length > 0) return selectableLeagues.map((league) => league.id)
    return leagues[0] ? [leagues[0].id] : []
  }, [selectableLeagues, leagues])

  const [selectedLeagueIds, setSelectedLeagueIds] = useState<string[]>(() => {
    // A ?l= from a shared link always wins over both localStorage and the
    // default, same as every other filter — see FiltersContext.
    const urlLeagues = getUrlParam(LEAGUES_URL_KEY)
    if (urlLeagues !== null) {
      const fromUrl = splitUrlList(urlLeagues).filter((id) =>
        selectableLeagues.some((league) => league.id === id),
      )
      return fromUrl.length > 0 ? fromUrl : defaultLeagueIds
    }

    const stored = getStoredStringArray(`${game}:selectedLeagueIds`, defaultLeagueIds)
    // Drops the live league id out of anything restored from a previous
    // session (from before it stopped being individually selectable), so a
    // stale localStorage value can't leave it as the sole "selected" league.
    const sanitized = stored.filter((id) => selectableLeagues.some((league) => league.id === id))
    return sanitized.length > 0 ? sanitized : defaultLeagueIds
  })

  useEffect(
    () => setStoredStringArray(`${game}:selectedLeagueIds`, selectedLeagueIds),
    [game, selectedLeagueIds],
  )

  // Mirrors the URL the same way FiltersContext does — removed entirely
  // when it matches the default (every selectable league) rather than the
  // current selection, so the URL only carries what's actually non-default.
  useEffect(() => {
    setUrlParams({
      [LEAGUES_URL_KEY]: sameElements(selectedLeagueIds, defaultLeagueIds) ? null : selectedLeagueIds.join(','),
    })
  }, [selectedLeagueIds, defaultLeagueIds])

  const toggleLeague = (leagueId: string) => {
    setSelectedLeagueIds((current) => {
      if (current.includes(leagueId)) {
        // Always keep at least one league selected.
        if (current.length === 1) return current
        return current.filter((id) => id !== leagueId)
      }
      return [...current, leagueId]
    })
  }

  const selectedLeagues = useMemo(
    () => leagues.filter((league) => selectedLeagueIds.includes(league.id)),
    [leagues, selectedLeagueIds],
  )

  const isDefaultSelection = sameElements(selectedLeagueIds, defaultLeagueIds)
  const resetLeagues = () => setSelectedLeagueIds(defaultLeagueIds)

  const [hoveredLeagueId, setHoveredLeagueId] = useState<string | null>(null)

  const value = useMemo<LeagueContextValue>(
    () => ({
      leagues,
      selectableLeagues,
      liveLeague,
      selectedLeagueIds,
      selectedLeagues,
      isLeagueSelected: (leagueId: string) => selectedLeagueIds.includes(leagueId),
      toggleLeague,
      isDefaultSelection,
      resetLeagues,
      hoveredLeagueId,
      setHoveredLeagueId,
    }),
    [
      leagues,
      selectableLeagues,
      liveLeague,
      selectedLeagues,
      selectedLeagueIds,
      isDefaultSelection,
      defaultLeagueIds,
      hoveredLeagueId,
    ],
  )

  return (
    <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>
  )
}

export function useLeague(): LeagueContextValue {
  const context = useContext(LeagueContext)
  if (!context) {
    throw new Error('useLeague must be used within a LeagueProvider')
  }
  return context
}
