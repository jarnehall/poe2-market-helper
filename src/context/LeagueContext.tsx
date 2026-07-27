import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getStoredStringArray, setStoredStringArray } from '../lib/storage'
import type { LeagueMeta } from '../types'
import { useMeta } from './MetaContext'

interface LeagueContextValue {
  leagues: LeagueMeta[]
  selectedLeagueIds: string[]
  selectedLeagues: LeagueMeta[]
  isLeagueSelected: (leagueId: string) => boolean
  toggleLeague: (leagueId: string) => void
}

const LeagueContext = createContext<LeagueContextValue | null>(null)

export function LeagueProvider({ children }: { children: ReactNode }) {
  const { leagues } = useMeta()

  const [selectedLeagueIds, setSelectedLeagueIds] = useState<string[]>(() =>
    getStoredStringArray('selectedLeagueIds', leagues.length > 0 ? [leagues[0].id] : []),
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
    () => leagues.filter((league) => selectedLeagueIds.includes(league.id)),
    [leagues, selectedLeagueIds],
  )

  const value = useMemo<LeagueContextValue>(
    () => ({
      leagues,
      selectedLeagueIds,
      selectedLeagues,
      isLeagueSelected: (leagueId: string) => selectedLeagueIds.includes(leagueId),
      toggleLeague,
    }),
    [leagues, selectedLeagues, selectedLeagueIds],
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
