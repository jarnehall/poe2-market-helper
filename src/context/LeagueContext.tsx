import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_LEAGUE_ID, LEAGUES } from '../lib/marketData'
import type { League } from '../lib/marketData'
import { getStoredStringArray, setStoredStringArray } from '../lib/storage'

interface LeagueContextValue {
  leagues: League[]
  selectedLeagues: League[]
  isLeagueSelected: (leagueId: string) => boolean
  toggleLeague: (leagueId: string) => void
}

const LeagueContext = createContext<LeagueContextValue | null>(null)

export function LeagueProvider({ children }: { children: ReactNode }) {
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<string[]>(() =>
    getStoredStringArray('selectedLeagueIds', [DEFAULT_LEAGUE_ID]),
  )

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
    () => LEAGUES.filter((league) => selectedLeagueIds.includes(league.id)),
    [selectedLeagueIds],
  )

  const value = useMemo<LeagueContextValue>(
    () => ({
      leagues: LEAGUES,
      selectedLeagues,
      isLeagueSelected: (leagueId: string) =>
        selectedLeagueIds.includes(leagueId),
      toggleLeague,
    }),
    [selectedLeagues, selectedLeagueIds],
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
