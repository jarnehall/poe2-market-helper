import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getStoredStringArray, setStoredStringArray } from '../lib/storage'
import type { LeagueMeta } from '../types'
import { useMeta } from './MetaContext'

interface LeagueContextValue {
  leagues: LeagueMeta[]
  selectableLeagues: LeagueMeta[]
  liveLeague: LeagueMeta | null
  selectedLeagueIds: string[]
  selectedLeagues: LeagueMeta[]
  isLeagueSelected: (leagueId: string) => boolean
  toggleLeague: (leagueId: string) => void
  // Which league's badge (if any) is currently hovered — purely ephemeral
  // UI state (not persisted), read by every chart on the page so hovering
  // one badge can highlight that league's line across all of them at once.
  hoveredLeagueId: string | null
  setHoveredLeagueId: (leagueId: string | null) => void
}

const LeagueContext = createContext<LeagueContextValue | null>(null)

export function LeagueProvider({ children }: { children: ReactNode }) {
  const { leagues } = useMeta()

  // The live league never contributes to best-investments ranking on its
  // own (its data is a display-only overlay, always fetched regardless of
  // selection — see MarketOverview) so it's excluded from the set a user
  // can toggle on/off entirely, not just from the default.
  const selectableLeagues = useMemo(() => leagues.filter((league) => !league.isLive), [leagues])
  const liveLeague = useMemo(() => leagues.find((league) => league.isLive) ?? null, [leagues])

  const [selectedLeagueIds, setSelectedLeagueIds] = useState<string[]>(() => {
    const defaultLeague = selectableLeagues[0] ?? leagues[0]
    const stored = getStoredStringArray('selectedLeagueIds', defaultLeague ? [defaultLeague.id] : [])
    // Drops the live league id out of anything restored from a previous
    // session (from before it stopped being individually selectable), so a
    // stale localStorage value can't leave it as the sole "selected" league.
    const sanitized = stored.filter((id) => selectableLeagues.some((league) => league.id === id))
    return sanitized.length > 0 ? sanitized : defaultLeague ? [defaultLeague.id] : []
  })

  useEffect(
    () => setStoredStringArray('selectedLeagueIds', selectedLeagueIds),
    [selectedLeagueIds],
  )

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
      hoveredLeagueId,
      setHoveredLeagueId,
    }),
    [leagues, selectableLeagues, liveLeague, selectedLeagues, selectedLeagueIds, hoveredLeagueId],
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
