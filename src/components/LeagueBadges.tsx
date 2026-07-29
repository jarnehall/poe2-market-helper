import type { CSSProperties } from 'react'
import { useLeague } from '../context/LeagueContext'

function LeagueBadges() {
  const { liveLeague, selectedLeagues } = useLeague()

  // The live league is always active (never toggled off, and not part of
  // selectedLeagues to begin with) — it leads the badge list, followed by
  // whichever historical leagues are actually selected in the Leagues
  // dropdown.
  const badgeLeagues = liveLeague ? [liveLeague, ...selectedLeagues] : selectedLeagues

  return (
    <div className="league-filter-badges" aria-label="Selected leagues">
      {badgeLeagues.map((league) => (
        <span
          key={league.id}
          className="league-filter-badge"
          style={{ '--league-color': league.color } as CSSProperties}
          title={
            league.isLive
              ? `${league.name} is the current league — always shown as a live overlay, not a selectable data source`
              : undefined
          }
        >
          <span className="league-filter-badge-dot" />
          {league.name}
          {league.isLive && <span className="league-filter-current-tag">Current</span>}
        </span>
      ))}
    </div>
  )
}

export default LeagueBadges
