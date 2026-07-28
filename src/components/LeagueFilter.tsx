import type { CSSProperties, ReactNode } from 'react'
import { useLeague } from '../context/LeagueContext'

function LeagueFilter({ children }: { children?: ReactNode }) {
  const { selectableLeagues, liveLeague, isLeagueSelected, toggleLeague } = useLeague()

  return (
    <div className="league-filter">
      <div className="league-filter-buttons" role="group" aria-label="Leagues">
        {selectableLeagues.map((league) => {
          const isSelected = isLeagueSelected(league.id)
          return (
            <button
              key={league.id}
              type="button"
              aria-pressed={isSelected}
              className={
                isSelected
                  ? 'league-filter-button league-filter-button-active'
                  : 'league-filter-button'
              }
              style={
                { '--league-color': league.color } as CSSProperties
              }
              onClick={() => toggleLeague(league.id)}
            >
              {league.name}
            </button>
          )
        })}
        {liveLeague && (
          // Not a toggle — the live league is always shown as an overlay
          // regardless of selection (it never contributes to the ranking),
          // so this just surfaces its color/name, not a selectable control.
          <span
            className="league-filter-live-badge"
            style={{ '--league-color': liveLeague.color } as CSSProperties}
            title={`${liveLeague.name} is always shown as a live overlay, not a selectable data source`}
          >
            <span className="league-filter-live-badge-dot" />
            {liveLeague.name}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

export default LeagueFilter
